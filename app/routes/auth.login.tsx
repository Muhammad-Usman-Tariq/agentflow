import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useActionData, useNavigation } from '@remix-run/react';
import { LoginForm } from '~/components/auth/LoginForm';
import { getUserByEmail } from '~/lib/db.server';
import { verifyPassword, signToken } from '~/lib/auth/auth.server';
import { createUserSession, getUser } from '~/lib/auth/session.server';
import { redirect } from '@remix-run/cloudflare';

export async function loader({ request, context }: LoaderFunctionArgs) {
  const user = await getUser(request, context.cloudflare?.env as any);
  if (user) throw redirect('/');
  return null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare?.env as any;

  const formData = await request.formData();
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password) {
    return json({ error: 'Email and password are required' }, { status: 400 });
  }

  const user = await getUserByEmail(email, env);
  if (!user) {
    return json({ error: 'Invalid email or password' }, { status: 400 });
  }

  const isValid = await verifyPassword(password, user.password_hash);
  if (!isValid) {
    return json({ error: 'Invalid email or password' }, { status: 400 });
  }

  // Bug 4 fix: claim guest projects so guest chats transfer to the user account on login
  const cookieHeader = request.headers.get('Cookie');
  const guestMatch = cookieHeader?.match(/__bolt_guest_id=([^;]+)/);
  if (guestMatch) {
    const guestId = decodeURIComponent(guestMatch[1]);
    const { claimGuestProjects } = await import('~/lib/db.server');
    await claimGuestProjects(String(user.id), guestId, env);
  }

  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  return createUserSession(token, '/');
}

export default function LoginPage() {
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'submitting';

  return <LoginForm error={actionData?.error} isLoading={isLoading} />;
}