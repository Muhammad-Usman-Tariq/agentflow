import type { Message } from 'ai';
// Re-export from enhanced parser
export type { ActionCallbackData, ArtifactCallbackData } from './enhanced-message-parser';
const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ACTION_TAG_OPEN = '<boltAction';
const ACTION_TAG_CLOSE = '</boltAction>';

export interface BoltAction {
  type: 'file' | 'shell' | 'start';
  filePath?: string;
  content: string;
}

export interface BoltArtifact {
  id: string;
  title: string;
  actions: BoltAction[];
}

function convertToXml(content: string): string {
  if (content.includes('<boltArtifact')) {
    return content;
  }

  const codeBlockMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1];
    const ext = content.match(/```(\w+)/)?.[1] || 'html';
    const fileName = ext === 'html' ? 'index.html' 
      : ext === 'css' ? 'styles.css'
      : ext === 'jsx' || ext === 'tsx' ? 'App.tsx'
      : `index.${ext}`;
    
    return `<boltArtifact id="auto-${Date.now()}" title="Generated Code">
<boltAction type="file" filePath="${fileName}">${code}</boltAction>
</boltArtifact>`;
  }

  return content;
}

export function parseMessages(messages: Message[]): BoltArtifact[] {
  const artifacts: BoltArtifact[] = [];

  for (const message of messages) {
    if (message.role !== 'assistant') continue;

    const content = typeof message.content === 'string' 
      ? convertToXml(message.content)
      : '';

    if (!content.includes(ARTIFACT_TAG_OPEN)) continue;

    const artifactMatches = content.matchAll(
      /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>([\s\S]*?)<\/boltArtifact>/g
    );

    for (const match of artifactMatches) {
      const [, id, title, actionsContent] = match;
      const actions: BoltAction[] = [];

      const actionMatches = actionsContent.matchAll(
        /<boltAction[^>]*type="([^"]*)"(?:[^>]*filePath="([^"]*)")?[^>]*>([\s\S]*?)<\/boltAction>/g
      );

      for (const actionMatch of actionMatches) {
        const [, type, filePath, actionContent] = actionMatch;
        actions.push({
          type: type as BoltAction['type'],
          filePath,
          content: actionContent.trim(),
        });
      }

      artifacts.push({ id, title, actions });
    }
  }

  return artifacts;
}

export function parseChunk(input: string): {
  output: string;
  artifacts: BoltArtifact[];
} {
  if (!input) return { output: '', artifacts: [] };

  const converted = convertToXml(input);
  
  const output = converted
    .replace(/<boltArtifact[^>]*>[\s\S]*?<\/boltArtifact>/g, '')
    .trim();

  const artifacts = parseMessages([{ 
    role: 'assistant', 
    content: converted,
    id: 'chunk',
  } as Message]);

  return { output, artifacts };
  
}