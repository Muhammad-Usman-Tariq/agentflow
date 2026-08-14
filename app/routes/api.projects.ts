import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { saveProject, getAllProjects, getProject, query, saveProjectForUser, getAllProjectsForUser, getProjectForUser, deleteProjectForUser } from '~/lib/db.server';
import { getUser } from '~/lib/auth/session.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const user = await getUser(request, env);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id) {
    // ✅ User logged in — us ka project
    // ✅ Guest — bhi dekh sake apna project by ID
    const project = await getProject(id, env);
    return json({ project });
  }

  // ✅ Sidebar list — sirf logged in user ke projects
  if (!user) {
    return json({ projects: [] }); // Guest ko koi list nahi
  }

  const projects = await getAllProjectsForUser(user.userId, env);
  return json({ projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const user = await getUser(request, env);

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

  // ✅ User logged in — user_id ke saath save
  if (user) {
    const project = await saveProjectForUser(id, title, messages, files, user.userId, env);
    return json({ project });
  }

  // Guest — bina user_id ke save
  const project = await saveProject(id, title, messages, files, env);
  return json({ project });
}