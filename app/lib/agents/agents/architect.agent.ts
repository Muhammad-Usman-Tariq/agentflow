import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import type { ProjectArchitecture } from '../types/project.types';
import { ARCHITECT_SYSTEM_PROMPT, ARCHITECT_USER_PROMPT } from '../prompts/architect.prompt';

export class ArchitectAgent extends AgentBase {
  constructor(env?: Record<string, string>) {
  super({
    name: 'architect',
    maxRetries: 3,
    timeoutMs: 150000, // ⚠️ was 60000 — now also plans DB schema + API routes, needs more time on a self-hosted backend
  }, env);
}

  async execute(input: AgentInput): Promise<AgentOutput> {
    if (!input.context?.requirements) {
      throw new Error('Architect needs requirements from Analyst first');
    }

    const userMessage = ARCHITECT_USER_PROMPT(input.context.requirements);

    const jsonString = await this.callLLM(
      ARCHITECT_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const architecture = this.parseJson<ProjectArchitecture>(jsonString);

    if (!architecture.fileStructure || !architecture.components) {
      throw new Error('Architect returned incomplete architecture');
    }

    console.log(`[Architect] Files planned: ${architecture.fileStructure.length}`);
    console.log(`[Architect] Components: ${architecture.components.length}`);

    return {
      success: true,
      agentName: 'architect',
      data: architecture,
    };
  }
}