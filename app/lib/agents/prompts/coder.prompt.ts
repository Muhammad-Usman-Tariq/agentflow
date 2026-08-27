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
`;

export const FRONTEND_FILE_USER_PROMPT = (
  requirements: any,
  architecture: any,
  designDecisions: any,
  filePath: string,
  purpose: string,
) =>
  `Project requirements: ${JSON.stringify(requirements)}\n` +
  `Full project file list (for import consistency — you are only writing ONE of these files right now): ${JSON.stringify(
    (architecture?.fileStructure || []).map((f: any) => f.path),
  )}\n` +
  `Components in this project: ${JSON.stringify(architecture?.components || [])}\n` +
  `API routes this frontend may call: ${JSON.stringify(architecture?.apiRoutes || [])}\n` +
  `Design decisions: ${JSON.stringify(designDecisions)}\n\n` +
  `Write the COMPLETE content of this ONE file:\n` +
  `Path: ${filePath}\n` +
  `Purpose: ${purpose}\n\n` +
  `Output only the raw file content, nothing else.`;

export const BACKEND_FILE_SYSTEM_PROMPT = `
You are an expert backend developer. Write the complete, working code for ONE
specific backend or database file in a larger project, based on the
architecture you're given.

RULES:
- Output ONLY the raw file content. No JSON, no markdown code fences, no
  explanation — start directly with the file's actual first character.
- No placeholders or TODOs — write real, complete, working code.
- If this is a database schema/migration file, match the given databaseSchema
  exactly (tables/collections, fields, types, foreign keys/relations).
- If this is a route handler file, implement the specific apiRoutes it's
  responsible for, reading/writing via the given databaseSchema.
`;

export const BACKEND_FILE_USER_PROMPT = (
  architecture: any,
  filePath: string,
  purpose: string,
) =>
  `Database type: ${architecture?.databaseType}\n` +
  `Database schema: ${JSON.stringify(architecture?.databaseSchema || [])}\n` +
  `API routes: ${JSON.stringify(architecture?.apiRoutes || [])}\n` +
  `Full project file list (for reference): ${JSON.stringify(
    (architecture?.fileStructure || []).map((f: any) => f.path),
  )}\n\n` +
  `Write the COMPLETE content of this ONE file:\n` +
  `Path: ${filePath}\n` +
  `Purpose: ${purpose}\n\n` +
  `Output only the raw file content, nothing else.`;