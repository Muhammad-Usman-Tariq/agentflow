import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import { EDITOR_SYSTEM_PROMPT, EDITOR_USER_PROMPT } from '../prompts/editor.prompt';
import { reconcileDependencies, createMissingImportStubs } from './coder.agent';

export class EditorAgent extends AgentBase {
  constructor(env?: Record<string, string>) {
    super(
      {
        name: 'editor',
        maxRetries: 2,
        timeoutMs: 300_000,
      },
      env,
    );
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { userRequest } = input;
    const existingFiles: Record<string, string> = (input.context as any)?.existingFiles || {};

    if (Object.keys(existingFiles).length === 0) {
      throw new Error('EditorAgent requires existingFiles in input context');
    }

    // Build the full file path list for context
    const allFilePaths = Object.keys(existingFiles)
      .filter((p) => /\.(tsx?|jsx?|css|scss|sql|json|html)$/.test(p))
      .slice(0, 40);

    // Select the most relevant files based on keywords in the user request
    const requestWords = userRequest
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3);

    const relevantFiles: Record<string, string> = {};

    // First pass: files whose path matches request keywords
    for (const [path, content] of Object.entries(existingFiles)) {
      if (Object.keys(relevantFiles).length >= 8) break;
      const pathLower = path.toLowerCase();
      if (requestWords.some((w) => pathLower.includes(w))) {
        relevantFiles[path] = content;
      }
    }

    // Second pass: fill to at least 3 files with the most central ones
    for (const [path, content] of Object.entries(existingFiles)) {
      if (Object.keys(relevantFiles).length >= 8) break;
      if (!(path in relevantFiles) && /\.(tsx?|jsx?)$/.test(path)) {
        relevantFiles[path] = content;
      }
    }

    const jsonString = await this.callLLM(
      EDITOR_SYSTEM_PROMPT,
      EDITOR_USER_PROMPT(userRequest, relevantFiles, allFilePaths),
      true,
    );

    const result = this.parseJson<{ changedFiles: Record<string, string> }>(jsonString);
    const changedFiles = result.changedFiles || {};

    if (Object.keys(changedFiles).length === 0) {
      throw new Error('EditorAgent returned no changed files');
    }

    // Surgical merge: overwrite only the returned paths, keep everything else
    const mergedFiles = { ...existingFiles, ...changedFiles };

    // Apply quality passes on merged project output
    reconcileDependencies(mergedFiles);
    createMissingImportStubs(mergedFiles);

    console.log(
      `[Editor] ✅ Surgical edit complete: ${Object.keys(changedFiles).length} file(s) changed out of ${Object.keys(existingFiles).length} existing`,
    );
    Object.keys(changedFiles).forEach((p) => console.log(`[Editor]   → ${p}`));

    return {
      success: true,
      agentName: 'editor',
      data: mergedFiles,
    };
  }
}
