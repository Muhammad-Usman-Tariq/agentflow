import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import type { ReviewFeedback } from '../types/project.types';
import { REVIEWER_SYSTEM_PROMPT, REVIEWER_USER_PROMPT } from '../prompts/reviewer.prompt';

export class ReviewerAgent extends AgentBase {
 constructor(env?: Record<string, string>) {
  super({
    name: 'reviewer',
    maxRetries: 2,
    timeoutMs: 120000, // ⚠️ was 60000 — bumped for self-hosted Qwen backend
  }, env);
}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { requirements, generatedCode } = input.context || {};

    if (!generatedCode || Object.keys(generatedCode).length === 0) {
      throw new Error('Reviewer needs generated code first');
    }

    const userMessage = REVIEWER_USER_PROMPT(requirements, generatedCode);

    const jsonString = await this.callLLM(
      REVIEWER_SYSTEM_PROMPT,
      userMessage,
      true
    );

    const feedback = this.parseJson<ReviewFeedback>(jsonString);

    console.log(`[Reviewer] Score: ${feedback.score}/100`);
    console.log(`[Reviewer] Passed: ${feedback.passed}`);
    console.log(`[Reviewer] Issues: ${feedback.issues?.length || 0}`);

    // Log critical issues
    const critical = feedback.issues?.filter(i => i.severity === 'critical') || [];
    if (critical.length > 0) {
      console.warn(`[Reviewer] ⚠️ Critical issues:`);
      critical.forEach(i => console.warn(`  → ${i.file}: ${i.message}`));
    }

    return {
      success: true,
      agentName: 'reviewer',
      data: feedback,
    };
  }
}