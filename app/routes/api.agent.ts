import { json, type ActionFunctionArgs } from '@remix-run/cloudflare';
import { Orchestrator } from '~/lib/agents/core/orchestrator';
import { mergeServerEnv } from '~/lib/.server/llm/utils';

// Mirrors the userId-resolution logic in api.projects.ts so the agent route
// can persist files server-side without a client round-trip.
async function getEffectiveUserIdForAgent(request: Request, env: any): Promise<string> {
  try {
    const { getUser } = await import('~/lib/auth/session.server');
    const user = await getUser(request, env);
    if (user?.userId) return String(user.userId);
  } catch {}

  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const match = cookieHeader.match(/__bolt_guest_id=([^;]+)/);
    if (match) return decodeURIComponent(match[1]);
  }

  return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { query } = await import('~/lib/db.server');
  const body = await request.json() as any;
  const { userRequest, chatId, forceOverwrite } = body;

  if (!userRequest || !chatId) {
    return json({
      success: false,
      error: 'userRequest and chatId are required',
    }, { status: 400 });
  }

  console.log(`\n🚀 Agent API called`);
  console.log(`Chat: ${chatId}`);
  console.log(`Request: "${userRequest}"`);

  const env = mergeServerEnv(context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined);

  // ── Part 3d: load existing project from DB for classification ───────────────
  let existingProject: { files: Record<string, string>; summary: string } | null = null;
  try {
    const { getProject } = await import('~/lib/db.server');
    const existing = await getProject(chatId, env);
    if (existing?.files) {
      const parsedFiles: Record<string, string> =
        typeof existing.files === 'string' ? JSON.parse(existing.files) : existing.files;
      if (Object.keys(parsedFiles).length > 0) {
        const fileList = Object.keys(parsedFiles).slice(0, 20).join(', ');
        existingProject = {
          files: parsedFiles,
          summary: `Title: "${existing.title}". Files: ${fileList}`,
        };
        console.log(
          `[Agent API] Existing project found: "${existing.title}" (${Object.keys(parsedFiles).length} files)`,
        );
      }
    }
  } catch (e: any) {
    console.warn('[Agent API] Could not load existing project (non-fatal):', e?.message);
  }
  // ────────────────────────────────────────────────────────────────────────

  try {
    console.log('ENV CHECK:', JSON.stringify(env));
    const orchestrator = new Orchestrator(env);

    const result = await orchestrator.start(
      userRequest,
      chatId,
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
         env
          );
        } catch (e) {
          console.error('Failed to save progress:', e);
        }
      },
      existingProject,
      forceOverwrite === true,
    );

    // ── Part 4: return confirmation request before doing any generation ───────
    if ((result as any).needsConfirmation) {
      return json({
        needsConfirmation: true,
        confirmationMessage: (result as any).confirmationMessage,
      });
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Bug 1 fix: persist files server-side before HTTP response ─────────────
    // The client-side storeMessageHistory() can be lost if the tab suspends
    // between the orchestrator finishing and the client-side fetch completing.
    // Saving here (server-side, before the response is sent) ensures files are
    // always in the DB regardless of client-side network state.
    const filesToSave = result.files && Object.keys(result.files).length > 0 ? result.files : null;
    if (filesToSave) {
      try {
        const { saveProjectForUser } = await import('~/lib/db.server');
        const userId = await getEffectiveUserIdForAgent(request, env);
        const title = userRequest.length > 60 ? userRequest.slice(0, 60) + '...' : userRequest;
        // Messages are intentionally left empty here — the client-side
        // storeMessageHistory() call owns message persistence. We only
        // own the files column in this server-side save.
        await saveProjectForUser(chatId, title, [], filesToSave, userId, env);
        console.log(`[Agent API] ✅ Files saved to DB server-side: ${Object.keys(filesToSave).length} files for chat_id=${chatId}`);
      } catch (saveErr: any) {
        // Non-fatal: log and continue. The client-side save is still a fallback.
        console.error('[Agent API] ⚠️ Server-side DB save failed (non-fatal):', saveErr?.message);
      }
    }
    // ──────────────────────────────────────────────────────────────────────────

    if (!result.success) {
      return json({
        success: false,
        error: result.error,
        files: result.files,
        fileCount: Object.keys(result.files || {}).length,
        runId: result.runId,
        warnings: (result as any).warnings,
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

  const env = mergeServerEnv(context.cloudflare?.env as unknown as Record<string, string | undefined> | undefined);

  try {
    const runResult = await query(
      'SELECT * FROM agent_runs WHERE id = $1',
      [runId],
      env
    );

    const tasksResult = await query(
      `SELECT agent_name, status, output, started_at, completed_at 
       FROM agent_tasks 
       WHERE run_id = $1 
       ORDER BY started_at ASC`,
        [runId],
        env
    );

    return json({
      run: runResult.rows[0] || null,
      tasks: tasksResult.rows,
    });

  } catch (error: any) {
    return json({ error: error.message }, { status: 500 });
  }
}
