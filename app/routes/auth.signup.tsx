import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { useActionData, useNavigation } from '@remix-run/react';
import { SignupForm } from '~/components/auth/SignupForm';
import { createUser, emailExists } from '~/lib/db.server';
import { hashPassword, signToken } from '~/lib/auth/auth.server';
import { createUserSession, getUser } from '~/lib/auth/session.server';
import { redirect } from '@remix-run/cloudflare';

// Already logged in? redirect to home
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await getUser(request);
  if (user) throw redirect('/');
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  // Validation
  if (!name || !email || !password) {
    return json({ error: 'All fields are required' }, { status: 400 });
  }

  if (password.length < 6) {
    return json({ error: 'Password must be at least 6 characters' }, { status: 400 });
  }

  // Check email already exists
  const exists = await emailExists(email);
  if (exists) {
    return json({ error: 'Email already registered. Please login.' }, { status: 400 });
  }

  // Create user
  const passwordHash = await hashPassword(password);
  const user = await createUser(email, passwordHash, name);

  // Create session
  const token = signToken({ userId: user.id, email: user.email, name: user.name });
  return createUserSession(token, '/');
}

export default function SignupPage() {
  const actionData = useActionData<{ error?: string }>();
  const navigation = useNavigation();
  const isLoading = navigation.state === 'submitting';

  return <SignupForm error={actionData?.error} isLoading={isLoading} />;
}