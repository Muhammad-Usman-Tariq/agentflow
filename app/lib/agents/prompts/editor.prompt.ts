/**
 * editor.prompt.ts
 *
 * Prompts for the EditorAgent (targeted edit of existing projects) and
 * the classification call that decides whether a new request is a
 * related edit vs. a brand-new project.
 */

// ── Classification (fast/cheap call in Orchestrator) ─────────────────────────

export const EDITOR_CLASSIFICATION_SYSTEM_PROMPT = `
You classify whether a new user request is related to an existing project or is a completely different new project.
Return ONLY valid JSON: { "classification": "related-edit" | "unrelated-new" | "ambiguous", "reasoning": "<one sentence>" }

Definitions:
- "related-edit": the request clearly modifies, fixes, adds features to, or extends the existing project (same domain/system)
- "unrelated-new": the request clearly describes a completely different application or project
- "ambiguous": genuinely unclear — could be either; when in doubt pick this
`.trim();

export const EDITOR_CLASSIFICATION_USER_PROMPT = (
  userRequest: string,
  projectSummary: string,
): string =>
  `Existing project summary:\n${projectSummary}\n\nNew user request: "${userRequest}"\n\nReturn JSON only.`;

// ── Targeted edit ─────────────────────────────────────────────────────────────

export const EDITOR_SYSTEM_PROMPT = `
You are an expert code editor making surgical, targeted changes to an existing codebase.

STRICT RULES:
1. Modify ONLY the files that need to change to satisfy the user's request.
2. Do NOT rewrite, remove, or restructure any existing function, component, or route that is NOT directly related to the request.
3. Preserve all currently-working code exactly as-is within any file you touch.
4. Only include files that actually changed in the output — do NOT include unchanged files.
5. If you need to add a new file, include it in changedFiles with its full path and complete content.

Return ONLY this JSON (no explanation, no markdown):
{
  "changedFiles": {
    "path/to/changed/file.tsx": "complete updated file content here",
    "path/to/new/file.ts": "complete new file content here"
  }
}
`.trim();

export const EDITOR_USER_PROMPT = (
  userRequest: string,
  relevantFileContents: Record<string, string>,
  allFilePaths: string[],
): string =>
  `User request: "${userRequest}"\n\n` +
  `All files in existing project (${allFilePaths.length} total):\n${allFilePaths.join(', ')}\n\n` +
  `Most relevant existing file contents (for context):\n` +
  Object.entries(relevantFileContents)
    .map(([path, content]) => {
      const safeContent = typeof content === 'string' ? content : JSON.stringify(content ?? '');
      if (typeof content !== 'string') {
        console.warn(`[Editor] Non-string content for ${path} — coercing before prompt build.`);
      }
      return `\n--- ${path} ---\n${safeContent.slice(0, 1500)}`;
    })
    .join('\n') +
  `\n\nMake targeted changes only. Return JSON with changedFiles only.`;
