import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import {
  FRONTEND_CODER_SYSTEM_PROMPT,
  FRONTEND_CODER_USER_PROMPT,
  BACKEND_CODER_SYSTEM_PROMPT,
  BACKEND_CODER_USER_PROMPT,
  FRONTEND_FILE_SYSTEM_PROMPT,
  FRONTEND_FILE_USER_PROMPT,
  BACKEND_FILE_SYSTEM_PROMPT,
  BACKEND_FILE_USER_PROMPT,
} from '../prompts/coder.prompt';
import { runBuildHeal } from '../core/build-healer';

const BACKEND_PATH_PREFIXES = ['server/', 'backend/', 'database/', 'migrations/'];

function isBackendPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '');
  return BACKEND_PATH_PREFIXES.some((p) => normalized.startsWith(p)) || normalized.endsWith('.sql');
}

const PER_FILE_TIMEOUT_MS = 150000;

const CONFIG_FILE_BASENAMES = new Set([
  'package.json',
  'vite.config.ts',
  'vite.config.js',
  'vite.config.mjs',
  'tsconfig.json',
  'tsconfig.node.json',
  'postcss.config.js',
  'postcss.config.cjs',
  'tailwind.config.js',
  'tailwind.config.cjs',
  'index.html',
  '.gitignore',
]);

function isConfigFile(path: string): boolean {
  const basename = path.replace(/^\/+/, '').split('/').pop() || '';
  return CONFIG_FILE_BASENAMES.has(basename);
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'app'
  );
}

function buildConfigFileTemplates(requirements: any, architecture: any): Record<string, string> {
  const projectName = slugify(requirements?.projectName || 'digitalsofts-app');
  const displayTitle = requirements?.projectName || 'App';
  const needsBackend =
    (architecture?.apiRoutes && architecture.apiRoutes.length > 0) ||
    (architecture?.databaseSchema && architecture.databaseSchema.length > 0);

  const packageJson = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
      ...(needsBackend ? { server: 'node server/index.js' } : {}),
    },
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
      'react-router-dom': '^6.22.0',
      ...(needsBackend
        ? {
            express: '^4.19.2',
            cors: '^2.8.5',
            dotenv: '^16.4.5',
            pg: '^8.11.5',
          }
        : {}),
    },
    devDependencies: {
      '@types/react': '^18.2.66',
      '@types/react-dom': '^18.2.22',
      '@vitejs/plugin-react': '^4.2.1',
      autoprefixer: '^10.4.19',
      postcss: '^8.4.38',
      tailwindcss: '^3.4.3',
      typescript: '^5.4.5',
      vite: '^5.2.0',
    },
  };

  // ── Bug 3 fix: add /api proxy in vite.config when backend is needed ──────────
  const viteConfig = needsBackend
    ? `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
`
    : `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
});
`;
  // ────────────────────────────────────────────────────────────────────────────

  return {
    'package.json': JSON.stringify(packageJson, null, 2),
    'vite.config.ts': viteConfig,
    'tsconfig.json': JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          useDefineForClassFields: true,
          lib: ['ES2020', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          skipLibCheck: true,
          moduleResolution: 'bundler',
          resolveJsonModule: true,
          isolatedModules: true,
          noEmit: true,
          jsx: 'react-jsx',
          strict: false,
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
        include: ['src'],
      },
      null,
      2,
    ),
    'postcss.config.js': `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
`,
    'tailwind.config.js': `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};
`,
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${displayTitle}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    '.gitignore': `node_modules\ndist\n.env\n.env.local\n`,
  };
}

const ENTRY_FILE_PATTERN = /^src\/main\.(tsx|jsx|ts|js)$/;

const ROUTER_USAGE_PATTERN = /(?:<Link|<Route|<BrowserRouter|<HashRouter|useNavigate|useLocation|useParams|<NavLink)[ >/]/;

function usesRouter(files: Record<string, string>): boolean {
  return Object.values(files).some((content) => ROUTER_USAGE_PATTERN.test(content));
}

const KNOWN_VERSIONS: Record<string, string> = {
  'react-icons': '^5.1.0',
  '@headlessui/react': '^2.1.2',
  '@mui/material': '^5.15.19',
  '@mui/icons-material': '^5.15.19',
  '@emotion/react': '^11.11.4',
  '@emotion/styled': '^11.11.5',
  'framer-motion': '^11.1.9',
  'lucide-react': '^0.378.0',
  'date-fns': '^3.6.0',
  'axios': '^1.6.8',
  'zod': '^3.23.8',
  'react-hook-form': '^7.51.4',
  'recharts': '^2.12.7',
  'chart.js': '^4.4.2',
  'react-chartjs-2': '^5.2.0',
  'clsx': '^2.1.1',
  'class-variance-authority': '^0.7.0',
  'tailwind-merge': '^2.3.0',
  '@radix-ui/react-dialog': '^1.1.1',
  '@radix-ui/react-dropdown-menu': '^2.1.1',
  '@radix-ui/react-label': '^2.1.0',
  '@radix-ui/react-slot': '^1.1.0',
  '@radix-ui/react-toast': '^1.2.1',
  'react-toastify': '^10.0.5',
  'react-hot-toast': '^2.4.1',
  'uuid': '^10.0.0',
  'nanoid': '^5.0.7',
  'bcrypt': '^5.1.1',
  'bcryptjs': '^2.4.3',
  'jsonwebtoken': '^9.0.2',
  'socket.io': '^4.7.5',
  'socket.io-client': '^4.7.5',
  'multer': '^1.4.5-lts.1',
  'sharp': '^0.33.3',
};

function reconcileDependencies(files: Record<string, string>): void {
  const sourceFiles = Object.entries(files).filter(
    ([p]) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && p !== 'vite.config.ts' && p !== 'postcss.config.js' && p !== 'tailwind.config.js',
  );

  const detectedPackages = new Set<string>();
  const importPattern = /^import\s[\s\S]*?['"]([^./][^'"]*)['"];?$/gm;
  const requirePattern = /require\(['"]((?:@[^/]+\/)?[^/.'"@][^'"]*?)['"]/g;

  for (const [, content] of sourceFiles) {
    let m: RegExpExecArray | null;

    importPattern.lastIndex = 0;
    while ((m = importPattern.exec(content)) !== null) {
      const spec = m[1];
      const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (pkgName && !pkgName.startsWith('.')) detectedPackages.add(pkgName);
    }

    requirePattern.lastIndex = 0;
    while ((m = requirePattern.exec(content)) !== null) {
      const spec = m[1];
      const pkgName = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (pkgName && !pkgName.startsWith('.')) detectedPackages.add(pkgName);
    }
  }

  if (!files['package.json']) return;
  let pkgJson: any;
  try {
    pkgJson = JSON.parse(files['package.json']);
  } catch {
    return;
  }

  const allDeclared = new Set([
    ...Object.keys(pkgJson.dependencies || {}),
    ...Object.keys(pkgJson.devDependencies || {}),
  ]);

  const SKIP_PREFIXES = ['node:', 'bun:', 'virtual:', 'vite', 'rollup'];
  const NODE_BUILTINS = new Set(['path', 'fs', 'os', 'url', 'http', 'https', 'crypto', 'stream', 'buffer', 'util', 'events', 'child_process', 'readline', 'zlib', 'assert', 'process', 'module', 'perf_hooks', 'async_hooks', 'worker_threads', 'cluster']);

  let injected = 0;
  pkgJson.dependencies = pkgJson.dependencies || {};

  for (const pkg of detectedPackages) {
    if (allDeclared.has(pkg)) continue;
    if (NODE_BUILTINS.has(pkg)) continue;
    if (SKIP_PREFIXES.some((p) => pkg.startsWith(p))) continue;

    const version = KNOWN_VERSIONS[pkg] || '*';
    pkgJson.dependencies[pkg] = version;
    injected++;
    console.log(`[Coder] reconcileDependencies: added missing dep "${pkg}": "${version}"`);
  }

  if (injected > 0) {
    files['package.json'] = JSON.stringify(pkgJson, null, 2);
    console.log(`[Coder] reconcileDependencies: injected ${injected} missing package(s) into package.json`);
  }
}

function ensureEntryPoint(files: Record<string, string>, architecture: any): void {
  const hasEntry = Object.keys(files).some((path) => ENTRY_FILE_PATTERN.test(path));
  if (hasEntry) {
    ensureBrowserRouter(files);
    return;
  }

  const pageFiles = Object.keys(files)
    .filter((p) => /\/pages\//.test(p) && /\.(tsx|jsx)$/.test(p))
    .sort();

  const hasCss = Object.keys(files).some((p) => p === 'src/index.css');
  if (!hasCss) {
    files['src/index.css'] = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';
  }

  const appFile = Object.keys(files).find((p) => /^src\/App\.(tsx|jsx)$/.test(p));
  if (!appFile && pageFiles.length > 1) {
    const routeImports: string[] = [];
    const routeElements: string[] = [];

    for (const pagePath of pageFiles) {
      const componentName = pagePath.split('/').pop()!.replace(/\.(tsx|jsx)$/, '');
      const importPath = './' + pagePath.replace(/^src\//, '').replace(/\.(tsx|jsx)$/, '');
      const routePath = '/' + componentName.toLowerCase().replace(/page$/i, '').replace(/index/i, '') || '/';
      routeImports.push(`import ${componentName} from '${importPath}';`);
      routeElements.push(`      <Route path="${routePath}" element={<${componentName} />} />`);
    }

    files['src/App.tsx'] = `import { Routes, Route } from 'react-router-dom';
${routeImports.join('\n')}

export default function App() {
  return (
    <Routes>
${routeElements.join('\n')}
    </Routes>
  );
}
`;

    files['src/main.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
`;
    console.warn(`[Coder] Composed App.tsx with ${pageFiles.length} pages and BrowserRouter-wrapped main.tsx`);
    return;
  }

  const firstPage =
    architecture?.fileStructure?.find((f: any) => /\/pages\//.test(f.path) && /\.(tsx|jsx)$/.test(f.path))?.path ||
    pageFiles[0];

  const targetPath = appFile || firstPage;

  if (!targetPath) {
    console.warn('[Coder] Could not find any component to wire up as the entry point — skipping entry-point fallback');
    return;
  }

  const importPath = './' + targetPath.replace(/^src\//, '').replace(/\.(tsx|jsx)$/, '');
  const componentName = targetPath.split('/').pop()!.replace(/\.(tsx|jsx)$/, '');

  const needsRouter = usesRouter(files);
  const routerImport = needsRouter ? `import { BrowserRouter } from 'react-router-dom';\n` : '';
  const routerOpen = needsRouter ? '    <BrowserRouter>\n      ' : '    ';
  const routerClose = needsRouter ? '\n    </BrowserRouter>' : '';

  files['src/main.tsx'] = `import React from 'react';
import ReactDOM from 'react-dom/client';
${routerImport}import ${componentName} from '${importPath}';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
${routerOpen}<${componentName} />${routerClose}
  </React.StrictMode>,
);
`;

  console.warn(`[Coder] No entry point was generated — added src/main.tsx (rendering ${componentName}${needsRouter ? ' with BrowserRouter' : ''}) and src/index.css as a fallback`);
}

function ensureBrowserRouter(files: Record<string, string>): void {
  const mainEntry = Object.keys(files).find((p) => ENTRY_FILE_PATTERN.test(p));
  if (!mainEntry) return;

  const mainContent = files[mainEntry];
  if (mainContent.includes('BrowserRouter') || mainContent.includes('HashRouter')) return;
  if (!usesRouter(files)) return;

  const withRouter = mainContent
    .replace(
      /import ReactDOM from ['"](react-dom\/client|react-dom)['"];/,
      `import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';`,
    )
    .replace(
      /(<React\.StrictMode>)(\s*)(<[A-Z][^/]*\/>)(\s*)(<\/React\.StrictMode>)/,
      `<React.StrictMode>\n    <BrowserRouter>\n      $3\n    </BrowserRouter>\n  </React.StrictMode>`,
    );

  if (withRouter !== mainContent) {
    files[mainEntry] = withRouter;
    console.warn(`[Coder] ensureBrowserRouter: wrapped existing ${mainEntry} render in <BrowserRouter>`);
  }
}

// ── Part 1d: lightweight syntax-balance checker ───────────────────────────────
function validateSyntaxBalance(code: string, filePath: string): { valid: boolean; error?: string } {
  if (!/\.(tsx?|jsx?)$/.test(filePath)) return { valid: true };

  let braces = 0, parens = 0, brackets = 0;
  let inSingle = false, inDouble = false, inTemplate = 0;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    const prev = i > 0 ? code[i - 1] : '';

    if (!inSingle && !inDouble && inTemplate === 0 && ch === '`' && prev !== '\\') { inTemplate++; continue; }
    if (inTemplate > 0) { if (ch === '`' && prev !== '\\') inTemplate--; continue; }
    if (!inDouble && ch === "'" && prev !== '\\') { inSingle = !inSingle; continue; }
    if (!inSingle && ch === '"' && prev !== '\\') { inDouble = !inDouble; continue; }
    if (inSingle || inDouble) continue;

    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '(') parens++;
    else if (ch === ')') parens--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }

  if (braces !== 0) return { valid: false, error: `Unbalanced braces (net: ${braces > 0 ? '+' : ''}${braces})` };
  if (parens !== 0) return { valid: false, error: `Unbalanced parentheses (net: ${parens > 0 ? '+' : ''}${parens})` };
  if (brackets !== 0) return { valid: false, error: `Unbalanced brackets (net: ${brackets > 0 ? '+' : ''}${brackets})` };
  return { valid: true };
}

// ── Part 1c: create minimal stubs for missing local relative imports ───────────
function resolveRelativeImport(fromFile: string, importPath: string): string {
  const parts = fromFile.split('/');
  parts.pop();
  for (const seg of importPath.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

function createMissingImportStubs(files: Record<string, string>): void {
  const IMPORT_RE = /^(?:import\s+(?:[\s\S]*?from\s+)?|export\s+\{[^}]*\}\s+from\s+)['"](\.[\/]?[^'"]+)['"]/gm;
  const REQUIRE_RE = /require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g;
  const TRY_EXTS = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];
  const stubs: Record<string, string> = {};

  for (const [filePath, content] of Object.entries(files)) {
    if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;

    for (const re of [IMPORT_RE, REQUIRE_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content)) !== null) {
        const importPath = m[1];
        const resolved = resolveRelativeImport(filePath, importPath);
        const exists = TRY_EXTS.some((ext) => (resolved + ext) in files || (resolved + ext) in stubs);
        if (exists) continue;

        const ext = resolved.includes('.') ? resolved.split('.').pop()! : '';
        if (ext === 'css' || ext === 'scss' || ext === 'sass') {
          stubs[resolved] = '/* auto-generated stub */\n';
        } else if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
          stubs[resolved] = 'export {};\n';
        } else if (!ext) {
          stubs[resolved + '.tsx'] = 'export {};\n';
        }
        // Unknown extension → skip
      }
    }
  }

  for (const [stubPath, content] of Object.entries(stubs)) {
    if (!(stubPath in files)) {
      files[stubPath] = content;
      console.log(`[Coder] ⚠️ Created stub for missing local import: ${stubPath}`);
    }
  }
}

export class CoderAgent extends AgentBase {
  constructor(env?: Record<string, string>) {
    super({
      name: 'coder',
      maxRetries: 3,
      timeoutMs: 1200000,
    }, env);
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { requirements, architecture, designDecisions } = input.context || {};

    if (!requirements || !architecture) {
      throw new Error('Coder needs requirements and architecture first');
    }

    const fileList: Array<{ path: string; purpose: string }> = (architecture as any).fileStructure || [];

    let allGeneratedFiles: Record<string, string> = {};

    if (fileList.length > 0) {
      allGeneratedFiles = await this.generatePerFile(fileList, requirements, architecture, designDecisions);
    } else {
      console.warn('[Coder] Architecture has no fileStructure — falling back to blob generation');
      allGeneratedFiles = await this.generateAsBlobsFallback(requirements, architecture, designDecisions);
    }

    const configTemplates = buildConfigFileTemplates(requirements, architecture);
    allGeneratedFiles = { ...allGeneratedFiles, ...configTemplates };

    ensureEntryPoint(allGeneratedFiles, architecture);

    if (Object.keys(allGeneratedFiles).length === 0) {
      throw new Error('Coder generated zero files');
    }

    const dataFiles = (input.context as any)?.dataFiles?.dataFiles || {};
    const integrationFiles = (input.context as any)?.integrationData?.files || {};

    const allFiles = {
      ...allGeneratedFiles,
      ...dataFiles,
      ...integrationFiles,
    };

    // ── Bug 2 fix: reconcile dependencies before returning ────────────────────
    reconcileDependencies(allFiles);
    // ────────────────────────────────────────────────────────────────────────

    // ── Part 1c: create stubs for any missing local relative imports ──────────
    createMissingImportStubs(allFiles);
    // ────────────────────────────────────────────────────────────────────────

    console.log(`[Coder] Total files generated: ${Object.keys(allFiles).length}`);
    Object.keys(allFiles).forEach((f) => console.log(`  → ${f}`));

    // ── Part 2: build self-healing loop (Node.js only, skipped on Workers) ───
    const healResult = await runBuildHeal(allFiles, this.callLLM.bind(this));
    const healedFiles = healResult.files;
    if (healResult.buildWarnings.length > 0) {
      healResult.buildWarnings.forEach((w) => console.warn(`[BuildHealer] ⚠️ ${w}`));
    }
    // ────────────────────────────────────────────────────────────────────────

    return {
      success: true,
      agentName: 'coder',
      data: healedFiles,
      ...(healResult.buildWarnings.length > 0 ? { warnings: healResult.buildWarnings } : {}),
    };
  }

  // ── Part 1d: generate one file safely with syntax validation + retry ────────
  private async generateSingleFileSafe(
    systemPrompt: string,
    userPromptFn: () => string,
    filePath: string,
  ): Promise<string | null> {
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      let code: string;
      try {
        const isRetry = attempt > 0;
        const prompt = isRetry
          ? `The previous response for "${filePath}" had a syntax error (unbalanced braces/parens/brackets). ` +
            `Rewrite the COMPLETE file from scratch.\n` +
            `IMPORTANT: Define all object/array constants as separate const variables ABOVE the component — ` +
            `never inline complex objects as JSX prop values. Ensure all {}, (), [] are perfectly balanced.\n\n` +
            userPromptFn()
          : userPromptFn();

        const raw = await this.callLLM(systemPrompt, prompt, false, PER_FILE_TIMEOUT_MS);
        code = this.stripCodeFence(raw);
      } catch (err: any) {
        console.error(`[Coder] ⚠️ LLM call failed for ${filePath} (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${err.message}`);
        if (attempt === MAX_RETRIES) return null;
        continue;
      }

      const check = validateSyntaxBalance(code, filePath);
      if (check.valid) return code;

      console.warn(`[Coder] ⚠️ Syntax imbalance in ${filePath} (attempt ${attempt + 1}/${MAX_RETRIES + 1}): ${check.error}`);
      if (attempt === MAX_RETRIES) {
        console.error(`[Coder] ❌ ${filePath} still has syntax issues after ${MAX_RETRIES} retries — using placeholder stub`);
        return null;
      }
    }
    return null;
  }

  private createPlaceholderStub(filePath: string, purpose: string): string {
    const ext = (filePath.split('.').pop() || '').toLowerCase();
    if (ext === 'css' || ext === 'scss') return `/* Placeholder: ${purpose} — generation failed */\n`;
    if (ext === 'sql') return `-- Placeholder: ${purpose} — generation failed\n`;
    const name = (filePath.split('/').pop() || 'Component').replace(/\.(tsx?|jsx?)$/, '');
    return (
      `// ⚠️ Placeholder: ${purpose} — generation failed after retries\n` +
      `export default function ${name}() {\n` +
      `  return <div style={{padding:16,color:'red'}}>⚠️ ${name} could not be generated</div>;\n` +
      `}\n`
    );
  }

  private async generatePerFile(
    fileList: Array<{ path: string; purpose: string }>,
    requirements: any,
    architecture: any,
    designDecisions: any,
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    const failed: string[] = [];

    const frontendFiles = fileList.filter((f) => !isBackendPath(f.path) && !isConfigFile(f.path));
    const backendFiles = fileList.filter((f) => isBackendPath(f.path) && !isConfigFile(f.path));
    const skippedConfigCount = fileList.length - frontendFiles.length - backendFiles.length;

    console.log(
      `[Coder] Generating ${frontendFiles.length} frontend file(s) and ${backendFiles.length} backend/database file(s), one call each` +
        (skippedConfigCount > 0 ? ` (${skippedConfigCount} config file(s) handled by template, no LLM call needed)` : '') +
        '...',
    );

    for (const file of frontendFiles) {
      console.log(`[Coder] → ${file.path}`);
      const code = await this.generateSingleFileSafe(
        FRONTEND_FILE_SYSTEM_PROMPT,
        () => FRONTEND_FILE_USER_PROMPT(requirements, architecture, designDecisions, file.path, file.purpose),
        file.path,
      );
      if (code !== null) {
        files[file.path] = code;
      } else {
        files[file.path] = this.createPlaceholderStub(file.path, file.purpose);
        failed.push(file.path);
      }
    }

    for (const file of backendFiles) {
      console.log(`[Coder] → ${file.path}`);
      const code = await this.generateSingleFileSafe(
        BACKEND_FILE_SYSTEM_PROMPT,
        () => BACKEND_FILE_USER_PROMPT(architecture, file.path, file.purpose),
        file.path,
      );
      if (code !== null) {
        files[file.path] = code;
      } else {
        files[file.path] = this.createPlaceholderStub(file.path, file.purpose);
        failed.push(file.path);
      }
    }

    if (failed.length > 0) {
      console.warn(`[Coder] ${failed.length} file(s) fell back to stub after retries: ${failed.join(', ')}`);
    }

    return files;
  }

  private async generateAsBlobsFallback(
    requirements: any,
    architecture: any,
    designDecisions: any,
  ): Promise<Record<string, string>> {
    const frontendJson = await this.callLLM(
      FRONTEND_CODER_SYSTEM_PROMPT,
      FRONTEND_CODER_USER_PROMPT(requirements, architecture, designDecisions),
      true,
    );
    const frontendResult = this.parseJson<{ files: Record<string, string> }>(frontendJson);

    let backendFiles: Record<string, string> = {};
    const needsBackend =
      (architecture.apiRoutes && architecture.apiRoutes.length > 0) ||
      (architecture.databaseSchema && architecture.databaseSchema.length > 0);

    if (needsBackend) {
      try {
        const backendJson = await this.callLLM(
          BACKEND_CODER_SYSTEM_PROMPT,
          BACKEND_CODER_USER_PROMPT(architecture),
          true,
        );
        const backendResult = this.parseJson<{ files: Record<string, string> }>(backendJson);
        backendFiles = backendResult.files || {};
      } catch (error: any) {
        console.error('[Coder] Backend generation failed, continuing with frontend only:', error.message);
      }
    }

    return {
      ...this.sanitizeFileMap(frontendResult.files),
      ...this.sanitizeFileMap(backendFiles),
    };
  }
}
