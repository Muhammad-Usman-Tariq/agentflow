import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Orchestrator } from '~/lib/agents/core/orchestrator';

export async function action({ request, context }: ActionFunctionArgs) {
  const { query } = await import('~/lib/db.server');
  const body = await request.json() as any;
  const { userRequest, chatId } = body;

  if (!userRequest || !chatId) {
    return json({
      success: false,
      error: 'userRequest and chatId are required',
    }, { status: 400 });
  }

  console.log(`\n🚀 Agent API called`);
  console.log(`Chat: ${chatId}`);
  console.log(`Request: "${userRequest}"`);

  try {
    console.log('ENV CHECK:', JSON.stringify(context.cloudflare?.env));
    const orchestrator = new Orchestrator(context.cloudflare?.env as any);

    const result = await orchestrator.start(
      userRequest,
      chatId,
      // Progress callback — saved to DB for SSE to pick up
      async (event) => {
        try {
          await query(
              `INSERT INTO agent_tasks 
          (run_id, agent_name, status, input, output, started_at, completed_at)
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
         [
          event.runId,
          event.agentName,
          event.status,
          JSON.stringify({ message: event.message }),
          event.data ? JSON.stringify(event.data) : null,
          ],
         context.cloudflare?.env as any
          );
        } catch (e) {
          // Progress save failure should not stop execution
          console.error('Failed to save progress:', e);
        }
      }
    );

    if (!result.success) {
      return json({
        success: false,
        error: result.error,
      }, { status: 500 });
    }

    return json({
      success: true,
      files: result.files,
      runId: result.runId,
      fileCount: Object.keys(result.files || {}).length,
    });

  } catch (error: any) {
    console.error('Agent API error:', error);
    return json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

// GET — check agent run status
export async function loader({ request, context }: any) {
  const { query } = await import('~/lib/db.server');
  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');

  if (!runId) {
    return json({ error: 'runId required' }, { status: 400 });
  }

  try {
    const runResult = await query(
      'SELECT * FROM agent_runs WHERE id = $1',
      [runId],
      context.cloudflare?.env as any
    );

    const tasksResult = await query(
      `SELECT agent_name, status, output, started_at, completed_at 
       FROM agent_tasks 
       WHERE run_id = $1 
       ORDER BY started_at ASC`,
        [runId],
        context.cloudflare?.env as any
    );

    return json({
      run: runResult.rows[0] || null,
      tasks: tasksResult.rows,
    });

  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}