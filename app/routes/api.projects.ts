import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { saveProject, getAllProjects, getProject, query, saveProjectForUser, getAllProjectsForUser, deleteProjectForUser } from '~/lib/db.server';

function getUserFromCookie(cookieHeader: string | null): any {
  if (!cookieHeader) return null;
  try {
    // __bolt_session cookie mein base64 encoded data hota hai
    const match = cookieHeader.match(/__bolt_session=([^;]+)/);
    if (!match) return null;
    const decoded = JSON.parse(atob(decodeURIComponent(match[1])));
    return decoded?.token ? JSON.parse(atob(decoded.token.split('.')[1])) : null;
  } catch {
    return null;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const user = getUserFromCookie(request.headers.get('Cookie'));
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const project = await getProject(id, env);
    return json({ project });
  }

  if (!user) return json({ projects: [] });

  const projects = await getAllProjectsForUser(user.userId, env);
  return json({ projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const user = getUserFromCookie(request.headers.get('Cookie'));

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      if (user) {
        await deleteProjectForUser(id, user.userId, env);
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
    const project = await saveProjectForUser(id, title, messages, files, user.userId, env);
    return json({ project });
  }

  const project = await saveProject(id, title, messages, files, env);
  return json({ project });
}