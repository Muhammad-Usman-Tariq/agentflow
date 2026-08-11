import type { AgentPlan, AgentPhase, AgentName } from '../types/task.types';
import type { AgentInput, AgentContext, AgentOutput } from '../types/agent.types';
import { saveAgentTask, updateRunStatus } from './agent-memory';

// Import all agents
import { AnalystAgent } from '../agents/analyst.agent';
import { ArchitectAgent } from '../agents/architect.agent';
import { CoderAgent } from '../agents/coder.agent';
import { ReviewerAgent } from '../agents/reviewer.agent';
import { UIUXAgent } from '../agents/uiux.agent';
import { DataAgent } from '../agents/data.agent';
import { IntegrationAgent } from '../agents/integration.agent';

// Progress callback — for SSE streaming to UI
export type ProgressCallback = (event: ProgressEvent) => void;

export interface ProgressEvent {
  runId: number;
  agentName: string;
  status: 'started' | 'done' | 'failed';
  message: string;
  data?: any;
}

// Get agent instance by name
function getAgent(name: AgentName) {
  switch (name) {
    case 'analyst':     return new AnalystAgent();
    case 'architect':   return new ArchitectAgent();
    case 'coder':       return new CoderAgent();
    case 'reviewer':    return new ReviewerAgent();
    case 'uiux':        return new UIUXAgent();
    case 'data':        return new DataAgent();
    case 'integration': return new IntegrationAgent();
    default: throw new Error(`Unknown agent: ${name}`);
  }
}

// Main runner — executes the full agent plan
export async function runAgentPlan(
  plan: AgentPlan,
  onProgress?: ProgressCallback
): Promise<AgentContext> {

  let context: AgentContext = {};

  await updateRunStatus(plan.runId, 'running');

  // Execute each phase in order
  for (const phase of plan.phases) {
    console.log(`\n🚀 Phase: ${phase.phaseName} [${phase.executionType}]`);

    if (phase.executionType === 'sequential') {
      // Run agents one by one — each gets previous agent's output
      for (const agentName of phase.agents) {
        context = await runSingleAgent(
          agentName,
          plan,
          context,
          onProgress
        );
      }
    } else {
      // Run all agents in this phase simultaneously
      const results = await Promise.allSettled(
        phase.agents.map((agentName: any) =>
          runSingleAgent(agentName, plan, context, onProgress)
        )
      );

      // Merge all parallel results into context
      for (const result of results) {
        if (result.status === 'fulfilled') {
          Object.assign(context, result.value);
        }
      }
    }
  }

  await updateRunStatus(plan.runId, 'done');
  return context;
}

// Run a single agent and update context
async function runSingleAgent(
  agentName: AgentName,
  plan: AgentPlan,
  context: AgentContext,
  onProgress?: ProgressCallback
): Promise<AgentContext> {

  const agent = getAgent(agentName);

  // Notify UI — agent started
  onProgress?.({
    runId: plan.runId,
    agentName,
    status: 'started',
    message: getStartMessage(agentName),
  });

  const input: AgentInput = {
    userRequest: plan.userRequest,
    chatId: plan.chatId,
    runId: plan.runId,
    context,
  };

  const output: AgentOutput = await agent.run(input);

  if (output.success) {
    // Save to DB
    await saveAgentTask(plan.runId, agentName, 'done', input, output.data);

    // Update context with this agent's output
    const updatedContext = updateContext(context, agentName, output.data);

    // Notify UI — agent done
    onProgress?.({
      runId: plan.runId,
      agentName,
      status: 'done',
      message: getDoneMessage(agentName),
      data: output.data,
    });

    return updatedContext;
  } else {
    // Save failure to DB
    await saveAgentTask(plan.runId, agentName, 'failed', input, null, output.error);

    // Notify UI — agent failed
    onProgress?.({
      runId: plan.runId,
      agentName,
      status: 'failed',
      message: `${agentName} failed: ${output.error}`,
    });

    // Return unchanged context — other agents continue
    return context;
  }
}

// Put agent output into right context field
function updateContext(
  context: AgentContext,
  agentName: AgentName,
  data: any
): AgentContext {
  const updated = { ...context };

  switch (agentName) {
    case 'analyst':     updated.requirements = data; break;
    case 'architect':   updated.architecture = data; break;
    case 'coder':       updated.generatedCode = data; break;
    case 'uiux':        updated.designDecisions = data; break;
    case 'reviewer':    updated.reviewFeedback = data; break;
  }

  return updated;
}

// Human readable messages for UI
function getStartMessage(agentName: AgentName): string {
  const messages: Record<AgentName, string> = {
    orchestrator: '🧠 Planning your project...',
    analyst:      '🔍 Analyzing requirements...',
    architect:    '📐 Designing file structure...',
    coder:        '💻 Writing code...',
    reviewer:     '🔎 Reviewing code quality...',
    uiux:         '🎨 Applying design decisions...',
    data:         '📦 Generating sample data...',
    integration:  '🔌 Setting up integrations...',
  };
  return messages[agentName] || `Running ${agentName}...`;
}

function getDoneMessage(agentName: AgentName): string {
  const messages: Record<AgentName, string> = {
    orchestrator: '✅ Plan ready',
    analyst:      '✅ Requirements analyzed',
    architect:    '✅ Architecture designed',
    coder:        '✅ Code written',
    reviewer:     '✅ Code reviewed',
    uiux:         '✅ Design applied',
    data:         '✅ Sample data ready',
    integration:  '✅ Integrations configured',
  };
  return messages[agentName] || `✅ ${agentName} done`;
}