import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

function getGuestIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/__bolt_guest_id=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getEffectiveUserId(request: Request, env: any): Promise<{ userId: string; newGuestId?: string }> {
  const { getUser } = await import('~/lib/auth/session.server');
  const user = await getUser(request, env);

  if (user?.userId) {
    return { userId: String(user.userId) };
  }

  const cookieHeader = request.headers.get('Cookie');
  let guestId = getGuestIdFromCookie(cookieHeader);
  let newGuestId: string | undefined = undefined;

  if (!guestId) {
    guestId = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    newGuestId = guestId;
  }

  return { userId: guestId, newGuestId };
}

function withCookieHeader(responseInit: ResponseInit | undefined, newGuestId?: string): ResponseInit {
  if (!newGuestId) return responseInit || {};
  const cookieValue = `__bolt_guest_id=${encodeURIComponent(newGuestId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`;
  const existingHeaders = new Headers(responseInit?.headers);
  existingHeaders.append('Set-Cookie', cookieValue);
  return { ...responseInit, headers: existingHeaders };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const { userId, newGuestId } = await getEffectiveUserId(request, env);
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  const { getProjectForUser, getAllProjectsForUser } = await import('~/lib/db.server');

  if (id) {
    const project = await getProjectForUser(id, userId, env);
    return json({ project: project || null }, withCookieHeader({}, newGuestId));
  }

  const projects = await getAllProjectsForUser(userId, env);
  return json({ projects: projects || [] }, withCookieHeader({}, newGuestId));
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;
  const { userId, newGuestId } = await getEffectiveUserId(request, env);
  const { saveProjectForUser, deleteProjectForUser } = await import('~/lib/db.server');

  if (request.method === 'DELETE') {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (id) {
      await deleteProjectForUser(id, userId, env);
      return json({ success: true }, withCookieHeader({}, newGuestId));
    }
    return json({ error: 'No id provided' }, withCookieHeader({ status: 400 }, newGuestId));
  }

  const body = (await request.json()) as { id: string; title: string; messages: any[]; files: any };
  const { id, title, messages, files } = body;

  if (!id) {
    return json({ error: 'No id provided' }, withCookieHeader({ status: 400 }, newGuestId));
  }

  const project = await saveProjectForUser(id, title || 'Untitled Project', messages, files, userId, env);
  return json({ project }, withCookieHeader({}, newGuestId));
}