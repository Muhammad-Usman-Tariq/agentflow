import { query } from '~/lib/db.server';
import type { AgentName } from '../types/task.types';

export async function createAgentRun(
  chatId: string,
  projectType: string,
  userRequest: string,
  env?: Record<string, string>
): Promise<number> {
  const result = await query(
    `INSERT INTO agent_runs (chat_id, status, project_type, requirements)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [chatId, 'pending', projectType, JSON.stringify({ userRequest })],
    env
  );
  return result.rows[0].id;
}

export async function updateRunStatus(
  runId: number,
  status: string,
  data?: { requirements?: any; architecture?: any },
  env?: Record<string, string>
): Promise<void> {
  if (data?.requirements) {
    await query(
      `UPDATE agent_runs SET status = $1, requirements = $2 WHERE id = $3`,
      [status, JSON.stringify(data.requirements), runId],
      env
    );
  } else if (data?.architecture) {
    await query(
      `UPDATE agent_runs SET status = $1, architecture = $2 WHERE id = $3`,
      [status, JSON.stringify(data.architecture), runId],
      env
    );
  } else {
    await query(
      `UPDATE agent_runs SET status = $1 WHERE id = $2`,
      [status, runId],
      env
    );
  }
}

export async function saveAgentTask(
  runId: number,
  agentName: string,
  status: string,
  input: any,
  output?: any,
  error?: string,
  env?: Record<string, string>
): Promise<void> {
  await query(
    `INSERT INTO agent_tasks 
     (run_id, agent_name, status, input, output, error, started_at, completed_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
    [
      runId,
      agentName,
      status,
      JSON.stringify(input),
      output ? JSON.stringify(output) : null,
      error || null,
    ],
    env
  );
}

export async function getAgentRun(runId: number, env?: Record<string, string>): Promise<any> {
  const runResult = await query(
    'SELECT * FROM agent_runs WHERE id = $1',
    [runId],
    env
  );

  if (!runResult.rows[0]) return null;

  const tasksResult = await query(
    'SELECT * FROM agent_tasks WHERE run_id = $1 ORDER BY started_at ASC',
    [runId],
    env
  );

  return {
    ...runResult.rows[0],
    tasks: tasksResult.rows,
  };
}

export async function getRunsForChat(chatId: string, env?: Record<string, string>): Promise<any[]> {
  const result = await query(
    `SELECT id, status, project_type, created_at, completed_at 
     FROM agent_runs 
     WHERE chat_id = $1 
     ORDER BY created_at DESC`,
    [chatId],
    env
  );
  return result.rows;
}