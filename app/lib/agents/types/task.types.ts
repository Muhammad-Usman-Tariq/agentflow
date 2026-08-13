import type { ProjectType } from './project.types';
export type TaskStatus = 
  | 'pending'     // Not started yet
  | 'running'     // Currently executing
  | 'done'        // Completed successfully
  | 'failed'      // Failed after all retries
  | 'skipped';    // Not needed for this project type

export type AgentName =
  | 'orchestrator'
  | 'analyst'
  | 'architect'
  | 'coder'
  | 'reviewer'
  | 'uiux'
  | 'data'
  | 'integration';

export interface Task {
  id: string;
  runId: number;
  agentName: AgentName;
  status: TaskStatus;
  input: any;
  output?: any;
  error?: string;
  startedAt?: Date;
  completedAt?: Date;
  retryCount: number;
}

// What orchestrator sends to agent-runner
export interface AgentPlan {
  runId: number;
  chatId: string;
  userRequest: string;
  projectType: ProjectType;
  phases: AgentPhase[];       // Execution order
   env?: Record<string, string>;
}

// Sequential = one by one, Parallel = all at once
export interface AgentPhase {
  phaseName: string;
  executionType: 'sequential' | 'parallel';
  agents: AgentName[];
}