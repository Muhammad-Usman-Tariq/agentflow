import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import type { ProjectRequirements } from '../types/project.types';
import { ANALYST_SYSTEM_PROMPT, ANALYST_USER_PROMPT } from '../prompts/analyst.prompt';

export class AnalystAgent extends AgentBase {
  constructor() {
    super({
      name: 'analyst',
      maxRetries: 3,
      timeoutMs: 60000, // 60 seconds
    });
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    const userMessage = ANALYST_USER_PROMPT(input.userRequest);

    const jsonString = await this.callLLM(
      ANALYST_SYSTEM_PROMPT,
      userMessage,
      true // expect JSON
    );

    const requirements = this.parseJson<ProjectRequirements>(jsonString);

    // Validate required fields
    if (!requirements.projectType || !requirements.pages || !requirements.features) {
      throw new Error('Analyst returned incomplete requirements');
    }

    console.log(`[Analyst] Project type: ${requirements.projectType}`);
    console.log(`[Analyst] Pages: ${requirements.pages.length}`);
    console.log(`[Analyst] Features: ${requirements.features.join(', ')}`);

    return {
      success: true,
      agentName: 'analyst',
      data: requirements,
    };
  }
}