import { AgentBase } from '../core/agent-base';
import type { AgentInput, AgentOutput } from '../types/agent.types';
import type { ProjectArchitecture } from '../types/project.types';
import {
  ARCHITECT_STRUCTURE_SYSTEM_PROMPT,
  ARCHITECT_STRUCTURE_USER_PROMPT,
  ARCHITECT_INTEGRATION_SYSTEM_PROMPT,
  ARCHITECT_INTEGRATION_USER_PROMPT,
} from '../prompts/architect.prompt';

const MAX_ARCHITECT_CEILING = 8000;
const BASE_TOKENS = 4000;
const TOKENS_PER_PAGE = 300;
const TOKENS_PER_FEATURE = 200;

function computeDynamicTokens(requirements: any): number {
  if (!requirements || typeof requirements !== 'object') {
    return BASE_TOKENS;
  }

  const pagesCount = Array.isArray(requirements.pages) ? requirements.pages.length : 1;
  const featuresCount = Array.isArray(requirements.features) ? requirements.features.length : 1;

  const estimated = BASE_TOKENS + pagesCount * TOKENS_PER_PAGE + featuresCount * TOKENS_PER_FEATURE;
  return Math.min(MAX_ARCHITECT_CEILING, estimated);
}

export class ArchitectAgent extends AgentBase {
  constructor(env?: Record<string, string>) {
    super(
      {
        name: 'architect',
        maxRetries: 3,
        timeoutMs: 240000,
      },
      env
    );
  }

  async execute(input: AgentInput): Promise<AgentOutput> {
    if (!input.context?.requirements) {
      throw new Error('Architect needs requirements from Analyst first');
    }

    const requirements = input.context.requirements;
    const tokenBudget = computeDynamicTokens(requirements);

    console.log(
      `[Architect] Computed dynamic token budget: ${tokenBudget} (pages: ${
        Array.isArray(requirements.pages) ? requirements.pages.length : 1
      }, features: ${Array.isArray(requirements.features) ? requirements.features.length : 1})`
    );

    // Call 1: Structure (frontend fileStructure & components)
    console.log('[Architect] Step 1/2: Generating fileStructure & components...');
    const structureUserMsg = ARCHITECT_STRUCTURE_USER_PROMPT(requirements);
    const structureJson = await this.callLLM(
      ARCHITECT_STRUCTURE_SYSTEM_PROMPT,
      structureUserMsg,
      true,
      undefined,
      tokenBudget
    );
    const structureData = this.parseJson<{ fileStructure: any[]; components: any[] }>(structureJson);

    // Call 2: Integration (backend apiRoutes & databaseSchema)
    console.log('[Architect] Step 2/2: Generating apiRoutes & databaseSchema...');
    const integrationUserMsg = ARCHITECT_INTEGRATION_USER_PROMPT(requirements);
    const integrationJson = await this.callLLM(
      ARCHITECT_INTEGRATION_SYSTEM_PROMPT,
      integrationUserMsg,
      true,
      undefined,
      tokenBudget
    );
    const integrationData = this.parseJson<{
      apiRoutes: any[];
      databaseType: 'relational' | 'non-relational';
      databaseSchema: any[];
    }>(integrationJson);

    // Merge into complete ProjectArchitecture
    const architecture: ProjectArchitecture = {
      fileStructure: structureData.fileStructure || [],
      components: structureData.components || [],
      apiRoutes: integrationData.apiRoutes || [],
      databaseType: integrationData.databaseType || 'relational',
      databaseSchema: integrationData.databaseSchema || [],
    };

    if (!architecture.fileStructure || architecture.fileStructure.length === 0 || !architecture.components) {
      throw new Error('Architect returned incomplete architecture');
    }

    console.log(`[Architect] ✅ Merged architecture planned:`);
    console.log(`[Architect] Files planned: ${architecture.fileStructure.length}`);
    console.log(`[Architect] Components: ${architecture.components.length}`);
    console.log(`[Architect] API Routes: ${architecture.apiRoutes.length}`);
    console.log(`[Architect] DB Type: ${architecture.databaseType}, Schemas: ${architecture.databaseSchema.length}`);

    return {
      success: true,
      agentName: 'architect',
      data: architecture,
    };
  }
}