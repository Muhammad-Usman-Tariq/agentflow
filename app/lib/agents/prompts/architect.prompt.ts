export const ARCHITECT_SYSTEM_PROMPT = `
You are a software architect. Design file structure for web projects.

Return ONLY this JSON:
{
  "fileStructure": [{"path": "string", "type": "file", "purpose": "string"}],
  "components": [{"name": "string", "filePath": "string", "props": ["string"], "dependencies": ["string"]}],
  "apiRoutes": [],
  "databaseSchema": []
}
`;

export const ARCHITECT_USER_PROMPT = (requirements: any) =>
  `Requirements: ${JSON.stringify(requirements)}\nReturn architecture JSON only.`;