import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import { CODER_SYSTEM_PROMPT, CODER_USER_PROMPT } from '../prompts/coder.prompt';

export class CoderAgent extends AgentBase {
 constructor(env?: Record<string, string>) {
  super({
    name: 'coder',
    maxRetries: 2,
    timeoutMs: 240000, // ⚠️ was 120000 — writes ALL files (frontend+backend+db), needs the most time on a self-hosted backend
  }, env);
}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { requirements, architecture, designDecisions } = input.context || {};

    if (!requirements || !architecture) {
      throw new Error('Coder needs requirements and architecture first');
    }

    const userMessage = CODER_USER_PROMPT(
      requirements,
      architecture,
      designDecisions
    );

    const jsonString = await this.callLLM(
      CODER_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const result = this.parseJson<{ files: Record<string, string> }>(jsonString);

    if (!result.files || Object.keys(result.files).length === 0) {
      throw new Error('Coder returned no files');
    }

    // Merge data files if data agent ran
    const dataFiles = input.context?.generatedCode || {};
    const integrationFiles = (input.context as any)?.integrationFiles || {};

    const allFiles = {
      ...result.files,
      ...dataFiles,
      ...integrationFiles,
    };

    console.log(`[Coder] Files generated: ${Object.keys(allFiles).length}`);
    Object.keys(allFiles).forEach(f => console.log(`  → ${f}`));

    return {
      success: true,
      agentName: 'coder',
      data: allFiles,
    };
  }
}