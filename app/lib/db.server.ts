import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text: string, params?: any[]) {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result;
  } finally {
    client.release();
  }
}

export async function saveProject(id: string, title: string, messages: any[], files: any) {
  const result = await query(
    `INSERT INTO projects (chat_id, title, messages, files, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (chat_id) DO UPDATE
     SET title = $2, messages = $3, files = $4, updated_at = NOW()
     RETURNING *`,
    [id, title, JSON.stringify(messages), JSON.stringify(files)]
  );
  return result.rows[0];
}

export async function getProject(id: string) {
  const result = await query(
    'SELECT * FROM projects WHERE chat_id = $1 OR id::text = $1',
    [id]
  );
  return result.rows[0];
}

export async function getAllProjects() {
  const result = await query(
    'SELECT id, title, created_at, updated_at FROM projects ORDER BY updated_at DESC'
  );
  return result.rows;
}

// ═══════════════════════════════════════════════════════════
// NEW: User Auth Functions (existing code upar same hai)
// ═══════════════════════════════════════════════════════════

export interface DBUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export async function createUser(email: string, passwordHash: string, name: string): Promise<DBUser> {
  const result = await query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, passwordHash, name]
  );
  return result.rows[0];
}

export async function getUserByEmail(email: string): Promise<DBUser | null> {
  const result = await query(
    `SELECT * FROM users WHERE email = $1`,
    [email]
  );
  return result.rows[0] || null;
}

export async function getUserById(id: string): Promise<DBUser | null> {
  const result = await query(
    `SELECT id, email, name, created_at FROM users WHERE id = $1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function emailExists(email: string): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM users WHERE email = $1`,
    [email]
  );
  return result.rows.length > 0;
}

// ═══════════════════════════════════════════════════════════
// NEW: User-scoped Project Functions
// ═══════════════════════════════════════════════════════════

export async function saveProjectForUser(id: string, title: string, messages: any[], files: any, userId: string) {
  const result = await query(
    `INSERT INTO projects (chat_id, title, messages, files, user_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (chat_id) DO UPDATE
     SET title = $2, messages = $3, files = $4, user_id = $5, updated_at = NOW()
     RETURNING *`,
    [id, title, JSON.stringify(messages), JSON.stringify(files), userId]
  );
  return result.rows[0];
}

export async function getProjectForUser(id: string, userId: string) {
  const result = await query(
    `SELECT * FROM projects WHERE (chat_id = $1 OR id::text = $1) AND user_id = $2`,
    [id, userId]
  );
  return result.rows[0];
}

export async function getAllProjectsForUser(userId: string) {
  const result = await query(
    `SELECT id, chat_id, title, created_at, updated_at
     FROM projects
     WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function deleteProjectForUser(chatId: string, userId: string) {
  const result = await query(
    `DELETE FROM projects WHERE chat_id = $1 AND user_id = $2 RETURNING *`,
    [chatId, userId]
  );
  return result.rows[0];
}