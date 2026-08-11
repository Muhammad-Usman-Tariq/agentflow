import type { Message } from 'ai';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';
const ACTION_TAG_OPEN = '<boltAction';
const ACTION_TAG_CLOSE = '</boltAction>';

export interface ArtifactCallbackData {
  messageId: string;
  artifactId: string;
    id?: string;        // ← ADD
  title: string;
  type?: string;
   closed?: boolean;   // ← ADD
}

export interface ActionCallbackData {
  artifactId: string;
  messageId: string;
  actionId: string;
  action?: {
    type: string;
    filePath?: string;
    content?: string;
  };
  id?: string;
  filePath?: string;
  content?: string;
  type?: string;
}

export interface ArtifactCallback {
  onArtifactOpen?: (data: ArtifactCallbackData) => void;
  onArtifactClose?: (data: ArtifactCallbackData) => void;
  onActionOpen?: (data: ActionCallbackData) => void;
  onActionClose?: (data: ActionCallbackData & { content: string }) => void;
}

function convertToXml(content: string): string {
  if (!content) return '';
  if (content.includes('<boltArtifact')) return content;

  const codeBlockMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1];
    const ext = content.match(/```(\w+)/)?.[1] || 'html';
    const fileName = ext === 'html' ? 'index.html'
      : ext === 'css' ? 'styles.css'
      : ext === 'jsx' || ext === 'tsx' ? 'App.tsx'
      : ext === 'js' ? 'index.js'
      : ext === 'ts' ? 'index.ts'
      : `index.${ext}`;

    return `<boltArtifact id="auto-${Date.now()}" title="Generated Code">
<boltAction type="file" filePath="${fileName}">${code}</boltAction>
</boltArtifact>`;
  }

  return content;
}

export class EnhancedStreamingMessageParser {
  private callbacks: ArtifactCallback;

  constructor(callbacks: ArtifactCallback = {}) {
    this.callbacks = callbacks;
  }

  parse(messageId: string, input: string): string {
    if (!input) return '';

    const converted = convertToXml(input);

    if (!converted.includes(ARTIFACT_TAG_OPEN)) {
      return converted;
    }

    let output = converted;

    const artifactMatch = converted.match(
      /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*>/
    );

    if (artifactMatch) {
      const [, artifactId, title] = artifactMatch;

      this.callbacks.onArtifactOpen?.({
        messageId,
        artifactId,
        title,
      });

      const actionMatches = converted.matchAll(
        /<boltAction[^>]*type="([^"]*)"(?:[^>]*filePath="([^"]*)")?[^>]*>([\s\S]*?)<\/boltAction>/g
      );

      let actionIndex = 0;
      for (const actionMatch of actionMatches) {
        const [, type, filePath, content] = actionMatch;
        const actionId = `action-${actionIndex++}`;

        this.callbacks.onActionOpen?.({
          artifactId,
          messageId,
          actionId,
          type,
          filePath,
        });

        this.callbacks.onActionClose?.({
          artifactId,
          messageId,
          actionId,
          type,
          filePath,
          content: content.trim(),
        });
      }

      this.callbacks.onArtifactClose?.({
        messageId,
        artifactId,
        title,
      });

      output = converted
        .replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/g, '')
        .trim();
    }

    return output;
    
  }
  reset(): void {}
}