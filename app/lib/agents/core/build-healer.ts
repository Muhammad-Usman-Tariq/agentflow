/**
 * build-healer.ts
 *
 * After Coder generates all files, this module:
 * 1. Feature-detects child_process / fs (skips gracefully in Cloudflare Workers)
 * 2. Writes the generated files to a temp directory
 * 3. Runs `npm install && npm run build` as a real child process
 * 4. On failure, uses the real error text to ask the LLM to fix the implicated file(s)
 * 5. Retries the build up to MAX_HEAL_ROUNDS total rounds
 * 6. Returns the (possibly improved) file set plus any build warnings
 */

export interface BuildHealResult {
  files: Record<string, string>;
  buildWarnings: string[];
}

type CallLLMFn = (
  systemPrompt: string,
  userPrompt: string,
  expectJson: boolean,
  timeout?: number,
) => Promise<string>;

const MAX_HEAL_ROUNDS = 3;
const NPM_INSTALL_TIMEOUT_MS = 120_000; // 2 min
const NPM_BUILD_TIMEOUT_MS = 90_000;    // 1.5 min
const LLM_FIX_TIMEOUT_MS = 60_000;

export async function runBuildHeal(
  files: Record<string, string>,
  callLLM: CallLLMFn,
): Promise<BuildHealResult> {
  const warnings: string[] = [];

  // ── Feature detect ─────────────────────────────────────────────────────────
  let cp: any = null;
  let fsMod: any = null;
  let pathMod: any = null;
  let osMod: any = null;

  try {
    cp = await import('child_process');
    fsMod = await import('fs/promises');
    pathMod = await import('path');
    osMod = await import('os');
  } catch {
    console.log('[BuildHealer] Skipping — child_process not available in this environment');
    return { files, buildWarnings: [] };
  }

  const tmpBase: string = pathMod.join(osMod.tmpdir(), `agentflow-build-${Date.now()}`);

  let currentFiles = { ...files };

  for (let round = 1; round <= MAX_HEAL_ROUNDS; round++) {
    console.log(
      `[BuildHealer] Round ${round}/${MAX_HEAL_ROUNDS} — writing ${Object.keys(currentFiles).length} files to temp dir`,
    );

    // Write files to temp dir
    try {
      await fsMod.rm(tmpBase, { recursive: true, force: true });
      await fsMod.mkdir(tmpBase, { recursive: true });
      for (const [filePath, content] of Object.entries(currentFiles)) {
        const absPath = pathMod.join(tmpBase, filePath);
        await fsMod.mkdir(pathMod.dirname(absPath), { recursive: true });
        await fsMod.writeFile(absPath, content, 'utf-8');
      }
    } catch (e: any) {
      console.error(`[BuildHealer] Failed to write temp dir: ${e.message}`);
      warnings.push(`BuildHealer: temp dir write failed — ${e.message}`);
      return { files: currentFiles, buildWarnings: warnings };
    }

    // npm install
    const installResult = await execWithTimeout(
      cp,
      'npm install --prefer-offline --no-audit --no-fund',
      tmpBase,
      NPM_INSTALL_TIMEOUT_MS,
    );
    if (!installResult.success) {
      const snippet = (installResult.stderr + installResult.stdout).slice(0, 500);
      console.warn(`[BuildHealer] npm install failed (round ${round}): ${snippet}`);
      if (round === MAX_HEAL_ROUNDS) {
        warnings.push(`BuildHealer: npm install still failing after ${MAX_HEAL_ROUNDS} rounds.\n${snippet}`);
      }
      continue;
    }

    // npm run build
    const buildResult = await execWithTimeout(cp, 'npm run build', tmpBase, NPM_BUILD_TIMEOUT_MS);

    if (buildResult.success) {
      console.log(`[BuildHealer] ✅ Build passed on round ${round}`);
      try { await fsMod.rm(tmpBase, { recursive: true, force: true }); } catch {}
      return { files: currentFiles, buildWarnings: warnings };
    }

    const errorOutput = `${buildResult.stderr}\n${buildResult.stdout}`.slice(0, 3000);
    console.warn(`[BuildHealer] Build failed (round ${round}):\n${errorOutput.slice(0, 500)}`);

    if (round === MAX_HEAL_ROUNDS) {
      warnings.push(
        `BuildHealer: build still failing after ${MAX_HEAL_ROUNDS} rounds. Last error:\n${errorOutput.slice(0, 1000)}`,
      );
      break;
    }

    // Identify the failing file from the error output
    const implicatedPath = identifyFailingFile(errorOutput, currentFiles);
    if (!implicatedPath) {
      warnings.push(
        `BuildHealer round ${round}: could not identify failing file from error — skipping LLM fix.\nError: ${errorOutput.slice(0, 400)}`,
      );
      break;
    }

    console.log(`[BuildHealer] Attempting LLM fix for: ${implicatedPath}`);
    const failingContent = currentFiles[implicatedPath] || '(empty)';

    try {
      const fixPrompt =
        `You are fixing a build error in a generated web application.\n\n` +
        `File with error: ${implicatedPath}\n\n` +
        `Current file content:\n\`\`\`\n${failingContent.slice(0, 2000)}\n\`\`\`\n\n` +
        `Build error:\n\`\`\`\n${errorOutput.slice(0, 1000)}\n\`\`\`\n\n` +
        `INSTRUCTIONS:\n` +
        `- Fix ONLY the error shown above\n` +
        `- Output ONLY the raw corrected file content — no markdown, no explanation\n` +
        `- Ensure all braces, parentheses, and brackets are balanced\n` +
        `- Define complex object/array values as const variables above the component — never inline them as JSX prop values`;

      const fixed = await callLLM(
        'You are an expert TypeScript/React developer. Fix the build error. Output only raw file content, no markdown.',
        fixPrompt,
        false,
        LLM_FIX_TIMEOUT_MS,
      );

      // Strip any accidental code fence wrapping
      currentFiles[implicatedPath] = fixed.replace(/^```[\w]*\r?\n?/, '').replace(/\r?\n?```$/, '');
      console.log(`[BuildHealer] Applied LLM fix to ${implicatedPath}, retrying build (round ${round + 1})...`);
    } catch (fixErr: any) {
      console.error(`[BuildHealer] LLM fix failed for ${implicatedPath}: ${fixErr.message}`);
      warnings.push(`BuildHealer: LLM fix for ${implicatedPath} failed — ${fixErr.message}`);
      break;
    }
  }

  // Cleanup
  try { await fsMod.rm(tmpBase, { recursive: true, force: true }); } catch {}
  return { files: currentFiles, buildWarnings: warnings };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function execWithTimeout(
  cp: any,
  cmd: string,
  cwd: string,
  timeout: number,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    cp.exec(
      cmd,
      { cwd, timeout, maxBuffer: 5 * 1024 * 1024 },
      (err: any, stdout: string, stderr: string) => {
        resolve({ success: !err, stdout: stdout || '', stderr: stderr || '' });
      },
    );
  });
}

function identifyFailingFile(
  errorOutput: string,
  files: Record<string, string>,
): string | null {
  const fileKeys = Object.keys(files);
  // Vite/esbuild error format: path/to/file.tsx:10:5 or path/to/file.tsx (line N)
  const FILE_REF_RE = /([a-zA-Z0-9_./\\-]+\.(tsx|ts|jsx|js|css|json))[:\s(]/g;
  let m: RegExpExecArray | null;

  while ((m = FILE_REF_RE.exec(errorOutput)) !== null) {
    const candidate = m[1].replace(/\\/g, '/').replace(/^\/+/, '');
    const match = fileKeys.find(
      (k) => k === candidate || k.endsWith('/' + candidate) || candidate.endsWith(k),
    );
    if (match) return match;
  }

  return null;
}
