import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

if (!process.env.JWT_SECRET) {
  throw new Error(
    '[auth] JWT_SECRET is not set.\n' +
    'Add JWT_SECRET=<random-64-char-string> to your .env.local (local dev) and to your\n' +
    'hosting platform environment variables (deployed). See .env.example for instructions.\n' +
    'Generate a value with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"\''
  );
}
const JWT_SECRET = process.env.JWT_SECRET as string;

export interface JWTPayload {
  userId: string;
  email: string;
  name: string;
}

// Password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// JWT
export function signToken(payload: JWTPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}