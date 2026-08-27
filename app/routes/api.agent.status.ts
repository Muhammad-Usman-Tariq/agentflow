import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { mergeServerEnv } from '~/lib/.server/llm/utils';

// Server Sent Events â€” real time progress streaming to UI
export async function loader({ request, context }: LoaderFunctionArgs) {
  const { query } = await import('~/lib/db.server');
  const env = mergeServerEnv(context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined);
  const url = new URL(request.url);
  const runId = url.searchParams.get('runId');

  if (!runId) {
    return new Response('runId required', { status: 400 });
  }

  // SSE stream
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const send = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      let lastTaskCount = 0;
      let attempts = 0;
      // âš ï¸ FIX: was 120 (2 min) â€” the coder agent alone can now legitimately
      // run up to 20 minutes (one LLM call per file against a slow, shared,
      // free-tier GPU). At 2 minutes the SSE stream gave up and disconnected
      // long before the orchestrator actually finished, making a genuinely
      // successful run look like it silently died in the UI. 900 attempts *
      // 1s poll interval = 15 minutes, matching the agents' own timeouts.
      const maxAttempts = 900; // 15 minutes max polling

      const poll = async () => {
        try {
          // Get run status
          const runResult = await query(
            'SELECT status, project_type FROM agent_runs WHERE id = $1',
            [runId],
             env 
          );

          const run = runResult.rows[0];
          if (!run) {
            send({ type: 'error', message: 'Run not found' });
            controller.close();
            return;
          }

          // Get latest tasks
          const tasksResult = await query(
            `SELECT agent_name, status, output, completed_at
             FROM agent_tasks
             WHERE run_id = $1
             ORDER BY completed_at ASC`,
            [runId],
             env
          );

          const tasks = tasksResult.rows;

          // Send new tasks to client
          if (tasks.length > lastTaskCount) {
            for (let i = lastTaskCount; i < tasks.length; i++) {
              send({
                type: 'task_update',
                agentName: tasks[i].agent_name,
                status: tasks[i].status,
                completedAt: tasks[i].completed_at,
              });
            }
            lastTaskCount = tasks.length;
          }

          // Run completed
          if (run.status === 'done' || run.status === 'failed') {
            send({
              type: 'completed',
              status: run.status,
              projectType: run.project_type,
            });
            controller.close();
            return;
          }

          // Timeout check
          attempts++;
          if (attempts >= maxAttempts) {
            send({ type: 'timeout', message: 'Agent run timed out' });
            controller.close();
            return;
          }

          // Poll every 1 second
          setTimeout(poll, 1000);

        } catch (error: any) {
          send({ type: 'error', message: error.message });
          controller.close();
        }
      };

      // Start polling
      await poll();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
