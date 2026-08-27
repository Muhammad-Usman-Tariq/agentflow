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

function expandFrontendFileStructure(
  rawFileStructure: Array<{ path: string; type: string; purpose: string }>,
  components: Array<{ name: string; filePath?: string; props?: string[]; dependencies?: string[] }>
): Array<{ path: string; type: string; purpose: string }> {
  // 1. Filter out directory-shaped placeholders (paths ending in / or matching generic folder patterns)
  const cleanFiles = (rawFileStructure || []).filter((f) => {
    if (!f || !f.path || typeof f.path !== 'string') return false;
    const p = f.path.trim();

    if (p.endsWith('/')) return false;
    if (/^src\/(components|pages|views)\/?$/i.test(p)) return false;

    const basename = p.split('/').pop() || '';
    if (!basename.includes('.')) return false;

    return true;
  });

  const existingPaths = new Set(cleanFiles.map((f) => f.path.trim()));

  // 2. Expand from components list so every component has an explicit file path entry
  if (Array.isArray(components)) {
    for (const comp of components) {
      const pathCandidate = (comp.filePath || (comp as any).path || '').trim();
      if (pathCandidate && pathCandidate.includes('.')) {
        if (!existingPaths.has(pathCandidate)) {
          cleanFiles.push({
            path: pathCandidate,
            type: 'file',
            purpose: `UI Component: ${comp.name || 'Component'}`,
          });
          existingPaths.add(pathCandidate);
        }
      }
    }
  }

  // 3. Ensure core entry point files exist
  if (!existingPaths.has('src/App.tsx') && !existingPaths.has('src/App.jsx')) {
    cleanFiles.push({
      path: 'src/App.tsx',
      type: 'file',
      purpose: 'Main application container and component routing',
    });
    existingPaths.add('src/App.tsx');
  }

  if (!existingPaths.has('src/main.tsx') && !existingPaths.has('src/main.jsx') && !existingPaths.has('src/index.tsx')) {
    cleanFiles.push({
      path: 'src/main.tsx',
      type: 'file',
      purpose: 'Application DOM entry point',
    });
    existingPaths.add('src/main.tsx');
  }

  return cleanFiles;
}

function synthesizeBackendFiles(
  apiRoutes: any[],
  databaseType: string,
  databaseSchema: any[]
): Array<{ path: string; type: string; purpose: string }> {
  const backendEntries: Array<{ path: string; type: string; purpose: string }> = [];

  // 1. Group apiRoutes by resource name
  if (Array.isArray(apiRoutes) && apiRoutes.length > 0) {
    const resources = new Set<string>();

    for (const route of apiRoutes) {
      const rawPath = route.path || '';
      const cleaned = rawPath.replace(/^\/+api\/+/, '').replace(/^\/+/, '');
      const segments = cleaned.split('/').filter(Boolean);
      const resourceSegment = segments[0] ? segments[0].replace(/^:[a-zA-Z0-9_-]+$/, '') : '';

      const resourceName =
        resourceSegment && !resourceSegment.startsWith(':') ? resourceSegment.toLowerCase() : 'general';

      resources.add(resourceName);
    }

    for (const resource of resources) {
      backendEntries.push({
        path: `server/routes/${resource}.js`,
        type: 'file',
        purpose: `Express API route handlers for ${resource}`,
      });
    }

    // Always add server entry point when API routes exist
    backendEntries.push({
      path: 'server/index.js',
      type: 'file',
      purpose: 'Express server entry point and API route mounting',
    });
  }

  // 2. Database schema / models file
  if (Array.isArray(databaseSchema) && databaseSchema.length > 0) {
    if (databaseType === 'non-relational') {
      backendEntries.push({
        path: 'server/database/models.ts',
        type: 'file',
        purpose: 'MongoDB/NoSQL document model definitions',
      });
    } else {
      backendEntries.push({
        path: 'server/database/schema.sql',
        type: 'file',
        purpose: 'Relational database schema DDL (tables, columns, foreign keys)',
      });
    }
  }

  return backendEntries;
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

    const rawStructureCount = structureData.fileStructure?.length || 0;
    const componentsList = structureData.components || [];

    // 1. Expand frontend fileStructure to ensure every component has a real 1:1 file path entry
    const expandedFrontendFiles = expandFrontendFileStructure(
      structureData.fileStructure || [],
      componentsList
    );

    // 2. Synthesize backend fileStructure entries from apiRoutes and databaseSchema
    const derivedBackendFiles = synthesizeBackendFiles(
      integrationData.apiRoutes || [],
      integrationData.databaseType || 'relational',
      integrationData.databaseSchema || []
    );

    const fullFileStructure: Array<{ path: string; type: string; purpose: string }> = [...expandedFrontendFiles];
    const existingPaths = new Set(expandedFrontendFiles.map((f) => f.path));
    const addedBackendEntries: Array<{ path: string; type: string; purpose: string }> = [];

    for (const entry of derivedBackendFiles) {
      if (!existingPaths.has(entry.path)) {
        fullFileStructure.push(entry);
        existingPaths.add(entry.path);
        addedBackendEntries.push(entry);
      }
    }

    // Merge into complete ProjectArchitecture
    const architecture: ProjectArchitecture = {
      fileStructure: fullFileStructure,
      components: componentsList,
      apiRoutes: integrationData.apiRoutes || [],
      databaseType: integrationData.databaseType || 'relational',
      databaseSchema: integrationData.databaseSchema || [],
    };

    if (!architecture.fileStructure || architecture.fileStructure.length === 0 || !architecture.components) {
      throw new Error('Architect returned incomplete architecture');
    }

    console.log(`[Architect] ✅ Merged architecture planned:`);
    console.log(
      `[Architect] Files planned: ${architecture.fileStructure.length} (expanded from ${rawStructureCount} raw entries + ${componentsList.length} components; ${expandedFrontendFiles.length} frontend + ${addedBackendEntries.length} backend)`
    );
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