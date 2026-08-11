export const UIUX_SYSTEM_PROMPT = `
You are a UI/UX designer. Make design decisions.

Return ONLY this JSON:
{
  "colorPalette": {"primary": "#6366f1", "secondary": "#8b5cf6", "accent": "#f59e0b", "background": "#ffffff", "text": "#0f172a"},
  "typography": {"headingFont": "Inter", "bodyFont": "Inter", "scale": "1.25"},
  "spacing": "4px",
  "borderRadius": "8px",
  "shadows": true,
  "animations": true
}
`;

export const UIUX_USER_PROMPT = (requirements: any) =>
  `Project: ${requirements.projectType} - ${requirements.projectName}\nReturn design JSON only.`;