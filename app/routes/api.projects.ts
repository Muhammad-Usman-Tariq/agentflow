import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { saveProject, getAllProjects, getProject, query } from '~/lib/db.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (id) {
    const project = await getProject(id, env);
    return json({ project });
  }

  const projects = await getAllProjects(env);
  return json({ projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      await query('DELETE FROM projects WHERE chat_id = $1 OR id::text = $1', [id], env);
      return json({ success: true });
    }
    return json({ error: 'No id provided' }, { status: 400 });
  }

  const body = await request.json() as { id: string; title: string; messages: any[]; files: any };
  const { id, title, messages, files } = body;
  const project = await saveProject(id, title, messages, files, env);
  return json({ project });
}