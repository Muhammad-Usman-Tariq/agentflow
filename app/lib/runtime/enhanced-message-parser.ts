import type { Message } from 'ai';

const ARTIFACT_TAG_OPEN = '<boltArtifact';
const ARTIFACT_TAG_CLOSE = '</boltArtifact>';

export interface ArtifactCallbackData {
  messageId: string;
  artifactId: string;
  id?: string;
  title: string;
  type?: string;
  closed?: boolean;
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
  onActionStream?: (data: ActionCallbackData) => void;
}

// ── Fallback: wrap orphaned markdown code blocks in boltArtifact ─────────────
function convertToXml(content: string): string {
  if (!content) return '';
  if (content.includes('<boltArtifact')) return content;

  const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
  const matches = Array.from(content.matchAll(codeBlockRegex));

  if (matches.length === 0) return content;

  const firstFenceIndex = content.indexOf('```');
  const textBefore = content.substring(0, firstFenceIndex).trim();
  const actions: string[] = [];
  const fileCountMap: Record<string, number> = {};

  for (const match of matches) {
    const ext = (match[1] || 'html').toLowerCase();
    const code = match[2].trim();
    if (!code) continue;

    let baseName =
      ext === 'html' ? 'index.html'
      : ext === 'css' ? 'styles.css'
      : ext === 'jsx' || ext === 'tsx' ? 'App.tsx'
      : ext === 'js' ? 'index.js'
      : ext === 'ts' ? 'index.ts'
      : ext === 'json' ? 'package.json'
      : `file.${ext}`;

    fileCountMap[baseName] = (fileCountMap[baseName] || 0) + 1;
    if (fileCountMap[baseName] > 1) {
      const parts = baseName.split('.');
      const extPart = parts.pop();
      baseName = `${parts.join('.')}_${fileCountMap[baseName]}.${extPart}`;
    }

    actions.push(`<boltAction type="file" filePath="${baseName}">${code}</boltAction>`);
  }

  if (actions.length === 0) return content;

  const artifactXml = `<boltArtifact id="generated-project" title="Generated Project">\n${actions.join('\n')}\n</boltArtifact>`;
  return textBefore ? `${textBefore}\n${artifactXml}` : artifactXml;
}

// ── Parser ────────────────────────────────────────────────────────────────────

export class EnhancedStreamingMessageParser {
  private callbacks: ArtifactCallback;
  private openedArtifacts = new Set<string>();
  private closedActions = new Set<string>();

  constructor(callbacks: ArtifactCallback = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Parse the accumulated content of a message.
   *
   * Replaces <boltArtifact ...>...</boltArtifact> blocks with a placeholder div:
   *   <div class="__boltArtifact__" data-message-id="..." data-artifact-id="..."></div>
   *
   * Fires callbacks (onArtifactOpen, onActionOpen, onActionClose, onArtifactClose)
   * as tags stream in and complete.
   */
  parse(messageId: string, input: string): string {
    if (!input) return '';

    const converted = convertToXml(input);

    if (!converted.includes(ARTIFACT_TAG_OPEN)) {
      return converted;
    }

    // Match the opening <boltArtifact id="..." title="..."> tag
    const artifactHeaderMatch = converted.match(
      /<boltArtifact[^>]*id="([^"]*)"(?:[^>]*title="([^"]*)")?[^>]*/
    );

    if (!artifactHeaderMatch) {
      return converted;
    }

    const artifactId = artifactHeaderMatch[1] || `art-${Date.now()}`;
    const title = artifactHeaderMatch[2] || 'Generated Project';
    const artifactKey = `${messageId}:::${artifactId}`;

    // 1. Open artifact in workbench if not already opened
    if (!this.openedArtifacts.has(artifactKey)) {
      this.openedArtifacts.add(artifactKey);
      this.callbacks.onArtifactOpen?.({
        messageId,
        artifactId,
        id: artifactId,
        title,
      });
    }

    // 2. Process all complete <boltAction> tags inside the input
    const actionMatches = converted.matchAll(
      /<boltAction[^>]*type="([^"]*)"(?:[^>]*filePath="([^"]*)")?[^>]*>([\s\S]*?)<\/boltAction>/g
    );

    let actionIndex = 0;
    for (const actionMatch of actionMatches) {
      const [, type, filePath, content] = actionMatch;
      const actionId = `${artifactId}-action-${actionIndex++}`;
      const actionKey = `${messageId}:::${actionId}`;

      if (!this.closedActions.has(actionKey)) {
        this.closedActions.add(actionKey);

        const actionObj = {
          type: type as 'file' | 'shell' | 'start',
          filePath,
          content: content.trim(),
        };

        this.callbacks.onActionOpen?.({
          artifactId,
          messageId,
          actionId,
          type,
          filePath,
          action: actionObj,
        });

        this.callbacks.onActionClose?.({
          artifactId,
          messageId,
          actionId,
          type,
          filePath,
          content: content.trim(),
          action: actionObj,
        });
      }
    }

    // 3. If </boltArtifact> has arrived, close the artifact
    if (converted.includes(ARTIFACT_TAG_CLOSE)) {
      this.callbacks.onArtifactClose?.({
        messageId,
        artifactId,
        id: artifactId,
        title,
        closed: true,
      });
    }

    // 4. Replace <boltArtifact ...> ... </boltArtifact> (or unclosed <boltArtifact...)
    // with the __boltArtifact__ placeholder div so ReactMarkdown renders <Artifact />
    const placeholder = `<div class="__boltArtifact__" data-message-id="${messageId}" data-artifact-id="${artifactId}"></div>`;

    if (converted.includes(ARTIFACT_TAG_CLOSE)) {
      return converted.replace(
        /<boltArtifact[\s\S]*?<\/boltArtifact>/g,
        `\n${placeholder}\n`
      );
    } else {
      // Unclosed artifact while streaming — replace from <boltArtifact to end
      const artifactStartIndex = converted.indexOf(ARTIFACT_TAG_OPEN);
      const prefix = converted.substring(0, artifactStartIndex);
      return `${prefix}\n${placeholder}\n`;
    }
  }

  reset(): void {
    this.openedArtifacts.clear();
    this.closedActions.clear();
  }
}