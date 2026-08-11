import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import type { DesignDecisions } from '../types/project.types';
import { UIUX_SYSTEM_PROMPT, UIUX_USER_PROMPT } from '../prompts/uiux.prompt';

export class UIUXAgent extends AgentBase {
  constructor() {
    super({
      name: 'uiux',
      maxRetries: 3,
      timeoutMs: 45000,
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    if (!input.context?.requirements) {
      throw new Error('UI/UX Agent needs requirements first');
    }

    const userMessage = UIUX_USER_PROMPT(input.context.requirements);

    const jsonString = await this.callLLM(
      UIUX_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const design = this.parseJson<DesignDecisions>(jsonString);

    if (!design.colorPalette || !design.typography) {
      throw new Error('UI/UX Agent returned incomplete design decisions');
    }

    console.log(`[UIUX] Primary color: ${design.colorPalette.primary}`);
    console.log(`[UIUX] Font: ${design.typography.headingFont}`);

    return {
      success: true,
      agentName: 'uiux',
      data: design,
    };
  }
}