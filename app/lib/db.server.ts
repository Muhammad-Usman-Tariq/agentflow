// app/lib/db.server.ts

let _pool: any = null;
let _sql: any = null;

function isCloudflare(env?: Record<string, string>) {
  // ⚠️ NOTE: process.versions.node CANNOT be trusted here — vite-plugin-node-polyfills
  // injects a fake `process` global (with a fake process.versions.node string) into the
  // Cloudflare Workers bundle too, so that old check always resolved to `false` on
  // production and silently routed every query through the broken `pg` (TCP) driver.
  //
  // Reliable signals instead:
  // 1. Cloudflare Pages always injects CF_PAGES=1 into the environment.
  // 2. Cloudflare Workers runtime always sets navigator.userAgent to 'Cloudflare-Workers'.
  if (env?.CF_PAGES) return true;
  if (typeof navigator !== 'undefined' && navigator.userAgent === 'Cloudflare-Workers') return true;
  return false;
}

async function getDb(env?: Record<string, string>) {
  const url = env?.DATABASE_URL || process.env?.DATABASE_URL || '';
  if (!url) throw new Error('DATABASE_URL not set');

  if (isCloudflare(env)) {
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
    const client = db.client;
    let result: any;
    if (typeof client.query === 'function') {
     result = await client.query(text, params || []);
}    else if (typeof client === 'function') {
    // neon tagged template — use sql.query instead
      result = await client.query(text, params || []);
    }else {
      throw new Error('Invalid Neon DB client');
    }
    const rows = Array.isArray(result) ? result : (result?.rows || []);
    return { rows };
  } else {
    const client = await db.client.connect();
    try {
      const result = await client.query(text, params || []);
      return result;
    } finally {
      client.release();
    }
  }
}

// ══════════════════════════════════════
// Schema bootstrap — runs once per cold start
// ══════════════════════════════════════

let _schemaReady = false;

export async function ensureSchema(env?: Record<string, string>) {
  if (_schemaReady) return;
  try {
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, [], env);

    // Create projects table (without user_id first — safe if it already exists)
    await query(`
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        chat_id TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL DEFAULT 'Untitled Project',
        messages JSONB NOT NULL DEFAULT '[]',
        files JSONB NOT NULL DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `, [], env);

    // Add user_id column if it doesn't exist (idempotent)
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'projects' AND column_name = 'user_id'
        ) THEN
          ALTER TABLE projects ADD COLUMN user_id TEXT;
          CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
        END IF;
      END
      $$
    `, [], env);

    _schemaReady = true;
    console.log('[DB] Schema ready');
  } catch (e) {
    console.error('[DB] ensureSchema error:', e);
    // Don't block — maybe partial schema is fine
  }
}

export async function saveProject(id: string, title: string, messages: any[], files: any, env?: Record<string, string>) {
  const messagesJson = typeof messages === 'string' ? messages : JSON.stringify(messages || []);
  const filesJson = typeof files === 'string' ? files : JSON.stringify(files || {});

  try {
    const result = await query(
      `INSERT INTO projects (chat_id, title, messages, files, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (chat_id) DO UPDATE
       SET title = $2, messages = $3, files = $4, updated_at = NOW()
       RETURNING *`,
      [id, title, messagesJson, filesJson],
      env
    );
    return result.rows[0];
  } catch (e) {
    const check = await query(`SELECT id FROM projects WHERE chat_id = $1`, [id], env);
    if (check.rows.length > 0) {
      const updateResult = await query(
        `UPDATE projects SET title = $1, messages = $2, files = $3, updated_at = NOW()
         WHERE chat_id = $4 RETURNING *`,
        [title, messagesJson, filesJson, id],
        env
      );
      return updateResult.rows[0];
    } else {
      const insertResult = await query(
        `INSERT INTO projects (chat_id, title, messages, files, updated_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING *`,
        [id, title, messagesJson, filesJson],
        env
      );
      return insertResult.rows[0];
    }
  }
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
    'SELECT id, chat_id, title, created_at, updated_at FROM projects ORDER BY updated_at DESC',
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
  

  const messagesJson = typeof messages === 'string' ? messages : JSON.stringify(messages || []);
  const filesJson = typeof files === 'string' ? files : JSON.stringify(files || {});

  console.log('[DB saveProject] chat_id:', id, '| user_id:', userId, '| title:', title);

  try {
    const result = await query(
      `INSERT INTO projects (chat_id, title, messages, files, user_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (chat_id) DO UPDATE
       SET title = $2, messages = $3, files = $4, user_id = $5, updated_at = NOW()
       RETURNING *`,
      [id, title, messagesJson, filesJson, userId],
      env
    );
    console.log('[DB saveProject] Saved row id:', result.rows[0]?.id);
    return result.rows[0];
  } catch (e: any) {
    console.error('[DB saveProject] Primary upsert failed:', e?.message);
    try {
      const check = await query(`SELECT id FROM projects WHERE chat_id = $1`, [id], env);
      if (check.rows.length > 0) {
        const updateResult = await query(
          `UPDATE projects SET title = $1, messages = $2, files = $3, user_id = $4, updated_at = NOW()
           WHERE chat_id = $5 RETURNING *`,
          [title, messagesJson, filesJson, userId, id],
          env
        );
        console.log('[DB saveProject] Fallback UPDATE ok, id:', updateResult.rows[0]?.id);
        return updateResult.rows[0];
      } else {
        const insertResult = await query(
          `INSERT INTO projects (chat_id, title, messages, files, user_id, updated_at)
           VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING *`,
          [id, title, messagesJson, filesJson, userId],
          env
        );
        console.log('[DB saveProject] Fallback INSERT ok, id:', insertResult.rows[0]?.id);
        return insertResult.rows[0];
      }
    } catch (e2: any) {
      console.error('[DB saveProject] All fallbacks failed:', e2?.message);
      throw e2;
    }
  }
}

export async function getProjectForUser(id: string, userId: string, env?: Record<string, string>) {
  try {
    const result = await query(
      `SELECT * FROM projects WHERE (chat_id = $1 OR id::text = $1) AND user_id = $2`,
      [id, userId],
      env
    );
    console.log('[DB getProject] id:', id, '| user_id:', userId, '| found:', result.rows.length);
    return result.rows[0];
  } catch (e: any) {
    console.error('[DB getProject] Error:', e?.message);
    return null;
  }
}

export async function getAllProjectsForUser(userId: string, env?: Record<string, string>) {
  try {
    const result = await query(
      `SELECT id, chat_id, title, created_at, updated_at
       FROM projects WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
      env
    );
    console.log('[DB getAllProjects] user_id:', userId, '| count:', result.rows.length);
    return result.rows;
  } catch (e: any) {
    console.error('[DB getAllProjects] Error:', e?.message);
    return [];
  }
}

export async function deleteProjectForUser(chatId: string, userId: string, env?: Record<string, string>) {
  const result = await query(
    `DELETE FROM projects WHERE chat_id = $1 AND user_id = $2 RETURNING *`,
    [chatId, userId],
    env
  );
  return result.rows[0];
}