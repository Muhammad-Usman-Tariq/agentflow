import { type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function action({ request }: ActionFunctionArgs) {
  const { destroyUserSession } = await import('~/lib/auth/session.server');
  return destroyUserSession(request);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { destroyUserSession } = await import('~/lib/auth/session.server');
  return destroyUserSession(request);
}