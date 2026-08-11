import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { query } from '~/lib/db.server';

// Server Sent Events — real time progress streaming to UI
export async function loader({ request }: LoaderFunctionArgs) {
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
      const maxAttempts = 120; // 2 minutes max polling

      const poll = async () => {
        try {
          // Get run status
          const runResult = await query(
            'SELECT status, project_type FROM agent_runs WHERE id = $1',
            [runId]
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
            [runId]
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