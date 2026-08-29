// ⚠️ FIX: this used to be ONE giant prompt asking for the entire project —
// frontend + backend + database — in a single JSON response. Every LLM call
// is capped at max_tokens: 8000 (see agent-base.ts). A small self-hosted
// model spends most of that budget on the frontend files (App.tsx, package.json,
// components, etc. — declared first), then runs out of budget/time before it
// ever reaches the backend route files or database schema, or the response
// gets cut off mid-JSON and the recovery parser can only salvage the small,
// early, well-formed files. Splitting into two focused calls gives each half
// its own full 8000-token budget instead of splitting one budget three ways.

export const FRONTEND_CODER_SYSTEM_PROMPT = `
You are an expert frontend developer. Write complete working frontend code
for this project based on the architecture you're given.

RULES:
- No placeholders or TODOs
- Complete working TypeScript/React code
- Tailwind CSS for styling, mobile responsive, error handling included
- Follow the given fileStructure paths for frontend files — don't invent a different layout
- If the architecture includes apiRoutes, call them from the frontend using fetch
  (e.g. fetch('/api/...')) — you are NOT writing the backend here, only the
  frontend code that will call it

Return ONLY this JSON:
{
  "files": {
    "src/App.tsx": "complete code",
    "src/main.tsx": "complete code",
    "package.json": "complete json",
    "index.html": "complete html",
    "tailwind.config.js": "complete config",
    "vite.config.ts": "complete config"
    // plus every other frontend file (components, pages, etc.) the architecture calls for
  }
}
`;

export const FRONTEND_CODER_USER_PROMPT = (requirements: any, architecture: any, designDecisions: any) =>
  `Build the FRONTEND for this project:\n` +
  `Requirements: ${JSON.stringify(requirements)}\n` +
  `Architecture (fileStructure/apiRoutes — apiRoutes tell you what endpoints to call, you are not implementing them here): ${JSON.stringify(architecture)}\n` +
  `Design: ${JSON.stringify(designDecisions)}\n` +
  `Write ALL frontend files. Return JSON only.`;

export const BACKEND_CODER_SYSTEM_PROMPT = `
You are an expert backend developer. Write complete working backend and
database code for this project based on the architecture you're given.

RULES:
- No placeholders or TODOs
- If databaseType is "relational": write real SQL (schema.sql or migrations/*.sql)
  matching the given databaseSchema exactly (tables, columns, types, foreign keys).
- If databaseType is "non-relational": write real MongoDB-style schema/model files
  (e.g. Mongoose schemas) matching the given databaseSchema's collections/fields.
- Implement each apiRoute from the architecture as a real backend route handler
  file that reads/writes using the schema you just wrote.
- Follow the given fileStructure paths for backend files — don't invent a different layout
- You are NOT writing the frontend here, only backend route handlers and database files

Return ONLY this JSON:
{
  "files": {
    // every backend route handler file and every database schema/migration
    // file the architecture calls for — nothing else
  }
}
`;

export const BACKEND_CODER_USER_PROMPT = (architecture: any) =>
  `Build the BACKEND and DATABASE for this project:\n` +
  `Architecture (apiRoutes/databaseType/databaseSchema — implement these exactly): ${JSON.stringify(architecture)}\n` +
  `Write ALL backend route files and database schema files described in the architecture. Return JSON only.`;

// ⚠️ FIX (root cause of "Expected property name or '}' in JSON" failures):
// asking a small self-hosted model to return MULTIPLE full source files
// escaped inside ONE JSON string blob reliably breaks — at MAX_COMPLETION_TOKENS
// budgets small enough for a free-tier GPU (e.g. 2048), the response gets cut
// off mid-file, mid-string, producing invalid JSON with no usable recovery.
// These PER-FILE prompts ask for exactly ONE file's raw content per call —
// no JSON wrapper, no escaping needed at all — so each call only needs a
// fraction of the tokens and a truncated/slow response only loses ONE file
// instead of the entire frontend or backend.

// ── 1a: version-pinned API cheat-sheet for every per-file frontend prompt ─────
const FRONTEND_VERSION_RULES = `
VERSION-PINNED API RULES — these override anything from your training data:
• react-dom 18: ReactDOM.createRoot(document.getElementById('root')!).render(<App/>)
  NEVER use ReactDOM.render() — that is the React 17 API and will crash on React 18.
• react-hook-form v7: const { register, handleSubmit, formState: { errors } } = useForm()
  Spread register: {...register('fieldName')}  — NEVER ref={register('fieldName')} (v6 API).
• react-router-dom v6: <Routes><Route path="/" element={<Home/>}/></Routes>
  Navigation: useNavigate() -> const nav = useNavigate(); nav('/path')
  NEVER useHistory() — that was removed in v6.
• BrowserRouter: ONE BrowserRouter lives in src/main.tsx only. NEVER add a second one
  inside App.tsx or any component — it causes "You cannot render a <Router> inside
  another <Router>" crash.
• Named imports: only import symbols that actually exist in the package. Do not invent
  export names (e.g. react-data-grid does NOT export Grid or Table).
`;

// ── 1a: helper to inject installed versions into per-file prompts ─────────────
export function buildVersionHintsBlock(pkgJson: any): string {
  const allDeps: Record<string, string> = {
    ...(pkgJson?.dependencies || {}),
    ...(pkgJson?.devDependencies || {}),
  };
  if (Object.keys(allDeps).length === 0) return '';
  const lines = Object.entries(allDeps)
    .map(([k, v]) => `  "${k}": "${v}"`)
    .join('\n');
  return (
    `Exact installed versions (write code that works with THESE versions, not any other):\n` +
    `{\n${lines}\n}`
  );
}

export const FRONTEND_FILE_SYSTEM_PROMPT = `
You are an expert frontend developer. Write the complete, working code for
ONE specific file in a larger project, based on the architecture you're given.

RULES:
- Output ONLY the raw file content. No JSON, no markdown code fences, no
  explanation, no "Here is the file" preamble — start directly with the
  file's actual first character.
- No placeholders or TODOs — write real, complete, working code.
- Use Tailwind CSS for styling where relevant, mobile responsive, include
  reasonable error handling.
- If this file needs to call a backend API route, use fetch (e.g. fetch('/api/...')).
- Stay consistent with the full project file list and components list you're
  given, so imports between files line up correctly.
${FRONTEND_VERSION_RULES}
`;

export const FRONTEND_FILE_USER_PROMPT = (
  requirements: any,
  architecture: any,
  designDecisions: any,
  filePath: string,
  purpose: string,
  versionHints?: string,
) =>
  `Project requirements: ${JSON.stringify(requirements)}\n` +
  `Full project file list (for import consistency — you are only writing ONE of these files right now): ${JSON.stringify(
    (architecture?.fileStructure || []).map((f: any) => f.path),
  )}\n` +
  `Components in this project: ${JSON.stringify(architecture?.components || [])}\n` +
  `API routes this frontend may call: ${JSON.stringify(architecture?.apiRoutes || [])}\n` +
  `Design decisions: ${JSON.stringify(designDecisions)}\n` +
  (versionHints ? `\n${versionHints}\n` : '') +
  `\nWrite the COMPLETE content of this ONE file:\n` +
  `Path: ${filePath}\n` +
  `Purpose: ${purpose}\n\n` +
  `Output only the raw file content, nothing else.`;

// ── Part 2: sql.js rules replace pg in every backend per-file prompt ──────────
const SQLITE_RULES = `
DATABASE — this project uses sql.js (embedded SQLite, no external DB required):
• Import the shared module:  import { getDb, persistDb } from '../database/db.js';
  (adjust relative path based on this file's location under server/)
• Query:
    const db = await getDb();
    const res = db.exec('SELECT * FROM t WHERE id = ?', [id]);
    const cols = res[0]?.columns ?? [];
    const rows = (res[0]?.values ?? []).map(r => Object.fromEntries(cols.map((c,i)=>[c,r[i]])));
• Write:
    db.run('INSERT INTO t (a, b) VALUES (?, ?)', [v1, v2]);
    persistDb();   // call after every write
• NEVER import or use pg, Pool, Client, DATABASE_URL, or any Postgres connection string.
• sql.js exec() returns [] on no match — always guard with ?. (optional chaining).
`;

export const BACKEND_FILE_SYSTEM_PROMPT = `
You are an expert backend developer. Write the complete, working code for ONE
specific backend or database file in a larger project, based on the
architecture you're given.

RULES:
- Output ONLY the raw file content. No JSON, no markdown code fences, no
  explanation — start directly with the file's actual first character.
- No placeholders or TODOs — write real, complete, working code.
- If this is a schema file (schema.sql), match the given databaseSchema exactly
  (tables, columns, types, NOT NULL, PRIMARY KEY, FOREIGN KEY).
- ROUTE HANDLER RULES:
  • Router files under server/routes/ MUST use bare paths relative to their mount point (e.g., router.get('/', ...), router.get('/:id', ...)).
  • NEVER repeat the router module name inside the router file (e.g. NEVER router.get('/patient', ...) inside patient.js). server/index.js mounts each router at /api/<name>.
  • Server entry point (server/index.js) MUST listen on port 3001 by default (matching vite.config.ts proxy).
- If this is a seed file (seed.sql or seed.js), generate 5-10 rows per table of realistic,
  varied sample data (names, dates, emails — NOT "Test User 1" placeholders).
${SQLITE_RULES}
`;

export const BACKEND_FILE_USER_PROMPT = (
  architecture: any,
  filePath: string,
  purpose: string,
  versionHints?: string,
) =>
  `Database type: ${architecture?.databaseType}\n` +
  `Database schema: ${JSON.stringify(architecture?.databaseSchema || [])}\n` +
  `API routes: ${JSON.stringify(architecture?.apiRoutes || [])}\n` +
  `Full project file list (for reference): ${JSON.stringify(
    (architecture?.fileStructure || []).map((f: any) => f.path),
  )}\n` +
  (versionHints ? `\n${versionHints}\n` : '') +
  `\nWrite the COMPLETE content of this ONE file:\n` +
  `Path: ${filePath}\n` +
  `Purpose: ${purpose}\n\n` +
  `Output only the raw file content, nothing else.`;