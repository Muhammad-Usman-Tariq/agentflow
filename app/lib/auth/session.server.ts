import { createCookieSessionStorage, redirect } from '@remix-run/cloudflare';
import { verifyToken, type JWTPayload } from './auth.server';

if (!process.env.SESSION_SECRET) {
  throw new Error(
    '[auth] SESSION_SECRET is not set.\n' +
    'Add SESSION_SECRET=<random-64-char-string> to your .env.local (local dev) and to your\n' +
    'hosting platform environment variables (deployed). See .env.example for instructions.\n' +
    "Generate a value with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\""
  );
}
const SESSION_SECRET = process.env.SESSION_SECRET as string;

export const sessionStorage = createCookieSessionStorage({
  cookie: {
    name: '__bolt_session',
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secrets: [SESSION_SECRET],
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 7,
  },
});

export async function getSession(request: Request) {
  return sessionStorage.getSession(request.headers.get('Cookie'));
}

export async function getUser(request: Request, env?: any): Promise<JWTPayload | null> {
  const session = await getSession(request);
  const token = session.get('token');
  if (!token) return null;
  return verifyToken(token);
}

export async function requireUser(request: Request): Promise<JWTPayload> {
  const user = await getUser(request);
  if (!user) {
    throw redirect('/auth/login');
  }
  return user;
}

export async function createUserSession(token: string, redirectTo: string) {
  const session = await sessionStorage.getSession();
  session.set('token', token);
  return redirect(redirectTo, {
    headers: {
      'Set-Cookie': await sessionStorage.commitSession(session),
    },
  });
}

export async function destroyUserSession(request: Request, redirectTo: string = '/') {
  const session = await getSession(request);
  return redirect(redirectTo, {
    headers: {
      'Set-Cookie': await sessionStorage.destroySession(session),
    },
  });
}