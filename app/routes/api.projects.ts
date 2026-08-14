import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const { getUser } = await import('~/lib/auth/session.server');
  const user = await getUser(request, env);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  const { getProjectForUser, getAllProjectsForUser } = await import('~/lib/db.server');

  if (id) {
    if (!user) {
      return json({ project: null });
    }
    const project = await getProjectForUser(id, user.userId, env);
    return json({ project: project || null });
  }

  if (!user) {
    return json({ projects: [] });
  }

  const projects = await getAllProjectsForUser(user.userId, env);
  return json({ projects });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const { getUser } = await import('~/lib/auth/session.server');
  const user = await getUser(request, env);
  const { saveProjectForUser, deleteProjectForUser } = await import('~/lib/db.server');

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      if (user) {
        await deleteProjectForUser(id, user.userId, env);
      }
      return json({ success: true });
    }
    return json({ error: 'No id provided' }, { status: 400 });
  }

  if (!user) {
    return json({ project: null });
  }

  const body = (await request.json()) as { id: string; title: string; messages: any[]; files: any };
  const { id, title, messages, files } = body;

  const project = await saveProjectForUser(id, title, messages, files, user.userId, env);
  return json({ project });
}