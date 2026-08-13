// app/lib/db.server.ts

let _pool: any = null;
let _sql: any = null;

function isCloudflare() {
  // Cloudflare Workers mein process.versions nahi hota
  return typeof process === 'undefined' || !process.versions?.node;
}

async function getDb(env?: Record<string, string>) {
  const url = env?.DATABASE_URL || process.env?.DATABASE_URL || '';
  if (!url) throw new Error('DATABASE_URL not set');

  if (isCloudflare()) {
    // ✅ Cloudflare — neon serverless
    if (!_sql) {
      const { neon } = await import('@neondatabase/serverless');
      _sql = neon(url);
    }
    return { type: 'neon', client: _sql };
  } else {
    // ✅ Local — pg Pool
    if (!_pool) {
      const pg = await import('pg');
      _pool = new pg.default.Pool({ connectionString: url });
    }
    return { type: 'pg', client: _pool };
  }
}

export async function query(text: string, params?: any[], env?: Record<string, string>) {
  const db = await getDb(env);

  if (db.type === 'neon') {
    const result = await db.client(text, params);
    return { rows: result as any[] };
  } else {
    const client = await db.client.connect();
    try {
      const result = await client.query(text, params);
      return result;
    } finally {
      client.release();
    }
  }
}

// ══════════════════════════════════════
// Saari functions — env parameter add
// ══════════════════════════════════════

export async function saveProject(id: string, title: string, messages: any[], files: any, env?: Record<string, string>) {
  const result = await query(
    `INSERT INTO projects (chat_id, title, messages, files, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (chat_id) DO UPDATE
     SET title = $2, messages = $3, files = $4, updated_at = NOW()
     RETURNING *`,
    [id, title, JSON.stringify(messages), JSON.stringify(files)],
    env
  );
  return result.rows[0];
}

export async function getProject(id: string, env?: Record<string, string>) {
  const result = await query(
    'SELECT * FROM projects WHERE chat_id = $1 OR id::text = $1',
    [id],
    env
  );
  return result.rows[0];
}

export async function getAllProjects(env?: Record<string, string>) {
  const result = await query(
    'SELECT id, title, created_at, updated_at FROM projects ORDER BY updated_at DESC',
    [],
    env
  );
  return result.rows;
}

export interface DBUser {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: Date;
  updated_at: Date;
}

export async function createUser(email: string, passwordHash: string, name: string, env?: Record<string, string>): Promise<DBUser> {
  const result = await query(
    `INSERT INTO users (email, password_hash, name)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [email, passwordHash, name],
    env
  );
  return result.rows[0];
}

export async function getUserByEmail(email: string, env?: Record<string, string>): Promise<DBUser | null> {
  const result = await query(
    `SELECT * FROM users WHERE email = $1`,
    [email],
    env
  );
  return result.rows[0] || null;
}

export async function getUserById(id: string, env?: Record<string, string>): Promise<DBUser | null> {
  const result = await query(
    `SELECT id, email, name, created_at FROM users WHERE id = $1`,
    [id],
    env
  );
  return result.rows[0] || null;
}

export async function emailExists(email: string, env?: Record<string, string>): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM users WHERE email = $1`,
    [email],
    env
  );
  return result.rows.length > 0;
}

export async function saveProjectForUser(id: string, title: string, messages: any[], files: any, userId: string, env?: Record<string, string>) {
  const result = await query(
    `INSERT INTO projects (chat_id, title, messages, files, user_id, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (chat_id) DO UPDATE
     SET title = $2, messages = $3, files = $4, user_id = $5, updated_at = NOW()
     RETURNING *`,
    [id, title, JSON.stringify(messages), JSON.stringify(files), userId],
    env
  );
  return result.rows[0];
}

export async function getProjectForUser(id: string, userId: string, env?: Record<string, string>) {
  const result = await query(
    `SELECT * FROM projects WHERE (chat_id = $1 OR id::text = $1) AND user_id = $2`,
    [id, userId],
    env
  );
  return result.rows[0];
}

export async function getAllProjectsForUser(userId: string, env?: Record<string, string>) {
  const result = await query(
    `SELECT id, chat_id, title, created_at, updated_at
     FROM projects WHERE user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
    env
  );
  return result.rows;
}

export async function deleteProjectForUser(chatId: string, userId: string, env?: Record<string, string>) {
  const result = await query(
    `DELETE FROM projects WHERE chat_id = $1 AND user_id = $2 RETURNING *`,
    [chatId, userId],
    env
  );
  return result.rows[0];
}