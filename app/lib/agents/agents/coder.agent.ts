import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import {
  FRONTEND_CODER_SYSTEM_PROMPT,
  FRONTEND_CODER_USER_PROMPT,
  BACKEND_CODER_SYSTEM_PROMPT,
  BACKEND_CODER_USER_PROMPT,
} from '../prompts/coder.prompt';

export class CoderAgent extends AgentBase {
 constructor(env?: Record<string, string>) {
  super({
    name: 'coder',
    maxRetries: 2,
    timeoutMs: 240000,
  }, env);
}

  async execute(input: AgentInput): Promise<AgentOutput> {
    const { requirements, architecture, designDecisions } = input.context || {};

    if (!requirements || !architecture) {
      throw new Error('Coder needs requirements and architecture first');
    }

    // ⚠️ FIX: this used to be ONE call asking for frontend + backend +
    // database together, sharing a single 8000-token budget (see
    // agent-base.ts). A self-hosted model would spend most/all of that
    // budget on the frontend (declared first) and never reach the backend
    // route files or database schema, or get cut off mid-JSON so only the
    // small, early, well-formed files survived. Splitting into two focused
    // calls gives each half its own full token budget.
    console.log('[Coder] Generating frontend...');
    const frontendJson = await this.callLLM(
      FRONTEND_CODER_SYSTEM_PROMPT,
      FRONTEND_CODER_USER_PROMPT(requirements, architecture, designDecisions),
      true
    );
    const frontendResult = this.parseJson<{ files: Record<string, string> }>(frontendJson);

    if (!frontendResult.files || Object.keys(frontendResult.files).length === 0) {
      throw new Error('Coder returned no frontend files');
    }

    let backendFiles: Record<string, string> = {};
    const needsBackend =
      (architecture.apiRoutes && architecture.apiRoutes.length > 0) ||
      (architecture.databaseSchema && architecture.databaseSchema.length > 0);

    if (needsBackend) {
      console.log('[Coder] Generating backend + database...');
      try {
        const backendJson = await this.callLLM(
          BACKEND_CODER_SYSTEM_PROMPT,
          BACKEND_CODER_USER_PROMPT(architecture),
          true
        );
        const backendResult = this.parseJson<{ files: Record<string, string> }>(backendJson);
        backendFiles = backendResult.files || {};
        console.log(`[Coder] Backend files generated: ${Object.keys(backendFiles).length}`);
      } catch (error: any) {
        // Don't let a failed backend call throw away the (successful)
        // frontend result — log it and continue with frontend-only output
        // rather than failing the whole agent.
        console.error('[Coder] Backend generation failed, continuing with frontend only:', error.message);
      }
    } else {
      console.log('[Coder] Architecture has no apiRoutes/databaseSchema — skipping backend call');
    }

    // Merge data/integration files if those agents already ran
    const dataFiles = (input.context as any)?.dataFiles?.dataFiles || {};
    const integrationFiles = (input.context as any)?.integrationData?.files || {};

    const allFiles = {
      ...frontendResult.files,
      ...backendFiles,
      ...dataFiles,
      ...integrationFiles,
    };

    console.log(`[Coder] Total files generated: ${Object.keys(allFiles).length}`);
    Object.keys(allFiles).forEach(f => console.log(`  → ${f}`));

    return {
      success: true,
      agentName: 'coder',
      data: allFiles,
    };
  }
}