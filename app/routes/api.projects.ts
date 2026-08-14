import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { saveProject, getAllProjects, getProject, query, saveProjectForUser, getAllProjectsForUser, deleteProjectForUser } from '~/lib/db.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as any;
  
  // ✅ Dynamic import — build error nahi aayega
  const { sessionStorage } = await import('~/lib/auth/session.server');
  const { verifyToken } = await import('~/lib/auth/auth.server');
  
  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  const token = session.get('token');
  const user = token ? verifyToken(token) : null;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const project = await getProject(id, env);
    return json({ project });
  }

  if (!user) return json({ projects: [] });

  const projects = await getAllProjectsForUser((user as any).userId, env);
  return json({ projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;

  const { sessionStorage } = await import('~/lib/auth/session.server');
  const { verifyToken } = await import('~/lib/auth/auth.server');

  const session = await sessionStorage.getSession(request.headers.get('Cookie'));
  const token = session.get('token');
  const user = token ? verifyToken(token) : null;

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      if (user) {
        await deleteProjectForUser(id, (user as any).userId, env);
      } else {
        await query('DELETE FROM projects WHERE chat_id = $1 OR id::text = $1', [id], env);
      }
      return json({ success: true });
    }
    return json({ error: 'No id provided' }, { status: 400 });
  }

  const body = await request.json() as { id: string; title: string; messages: any[]; files: any };
  const { id, title, messages, files } = body;

  if (user) {
    const project = await saveProjectForUser(id, title, messages, files, (user as any).userId, env);
    return json({ project });
  }

  const project = await saveProject(id, title, messages, files, env);
  return json({ project });
}