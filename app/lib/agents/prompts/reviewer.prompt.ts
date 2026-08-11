export const REVIEWER_SYSTEM_PROMPT = `
You are a code reviewer. Review code quality.

Return ONLY this JSON:
{
  "passed": true,
  "score": 85,
  "issues": [],
  "suggestions": []
}
`;

export const REVIEWER_USER_PROMPT = (requirements: any, generatedCode: any) =>
  `Files generated: ${Object.keys(generatedCode || {}).join(', ')}\nReturn review JSON only.`;