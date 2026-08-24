import type { ProjectRequirements, ProjectArchitecture, DesignDecisions, ReviewFeedback } from './project.types';
// Every agent must follow this contract
export interface AgentInput {
  userRequest: string;        // Original user message
  chatId: string;             // Which chat this belongs to
  runId?: number;             // DB run ID for tracking
  context?: AgentContext;     // What previous agents produced
}

export interface AgentContext {
  requirements?: ProjectRequirements;   // From Analyst
  architecture?: ProjectArchitecture;   // From Architect
  generatedCode?: Record<string, string>; // From Coder
  designDecisions?: DesignDecisions;    // From UI/UX
  reviewFeedback?: ReviewFeedback;      // From Reviewer
  dataFiles?: { dataFiles?: Record<string, string>; sampleData?: any };       // From Data agent
  integrationData?: { files?: Record<string, string>; packages?: string[]; integrations?: string[]; envVariables?: any[] }; // From Integration agent
}

export interface AgentOutput {
  success: boolean;
  agentName: string;
  data: any;                  // Each agent returns different data
  error?: string;
  tokensUsed?: number;
}

export interface AgentConfig {
  name: string;
  maxRetries: number;         // How many times to retry on failure
  timeoutMs: number;          // Kill agent if takes too long
  model?: string;             // Override default model
}

// Every agent class must implement this
export interface IAgent {
  config: AgentConfig;
  run(input: AgentInput): Promise<AgentOutput>;
}