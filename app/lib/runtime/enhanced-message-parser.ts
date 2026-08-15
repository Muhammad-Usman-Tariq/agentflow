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

  const codeBlockMatch = content.match(/```(?:\w+)?\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    const code = codeBlockMatch[1];
    const ext = content.match(/```(\w+)/)?.[1] || 'html';
    const fileName =
      ext === 'html' ? 'index.html'
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

// ── Parser ────────────────────────────────────────────────────────────────────

export class EnhancedStreamingMessageParser {
  private callbacks: ArtifactCallback;

  /**
   * Track which artifact keys have already had their callbacks fired so we
   * NEVER fire them more than once per message/artifact combination — even
   * when parse() is called repeatedly during streaming.
   */
  private processedArtifacts = new Set<string>();

  constructor(callbacks: ArtifactCallback = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Parse the FULL accumulated content of a message.
   *
   * Returns the text that should be DISPLAYED in the chat:
   *   • Anything before the <boltArtifact> tag
   *   • Anything after the </boltArtifact> tag
   *   • The artifact block itself is ALWAYS suppressed (even when partial)
   *
   * Callbacks are fired exactly ONCE per artifact (guarded by processedArtifacts).
   */
  parse(messageId: string, input: string): string {
    if (!input) return '';

    const converted = convertToXml(input);

    // No artifact in this message — return as-is
    if (!converted.includes(ARTIFACT_TAG_OPEN)) {
      return converted;
    }

    const artifactStart = converted.indexOf(ARTIFACT_TAG_OPEN);
    const beforeArtifact = converted.substring(0, artifactStart);
    const isComplete = converted.includes(ARTIFACT_TAG_CLOSE);

    // ── Artifact is still streaming (not yet closed) ───────────────────────
    // Suppress everything from <boltArtifact onwards — show only text before it
    if (!isComplete) {
      return beforeArtifact;
    }

    // ── Artifact is complete — process it exactly once ─────────────────────
    const afterArtifact = converted
      .replace(/<boltArtifact[\s\S]*?<\/boltArtifact>/g, '')
      .trim();

    const artifactMatch = converted.match(
      /<boltArtifact[^>]*id="([^"]*)"[^>]*title="([^"]*)"[^>]*/
    );

    if (artifactMatch) {
      const [, artifactId, title] = artifactMatch;
      const artifactKey = `${messageId}:::${artifactId}`;

      // ── Guard: fire callbacks only once per artifact ──────────────────
      if (!this.processedArtifacts.has(artifactKey)) {
        this.processedArtifacts.add(artifactKey);

        this.callbacks.onArtifactOpen?.({ messageId, artifactId, title });

        const actionMatches = converted.matchAll(
          /<boltAction[^>]*type="([^"]*)"(?:[^>]*filePath="([^"]*)")?[^>]*>([\s\S]*?)<\/boltAction>/g
        );

        let actionIndex = 0;
        for (const actionMatch of actionMatches) {
          const [, type, filePath, content] = actionMatch;
          const actionId = `action-${actionIndex++}`;
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

        this.callbacks.onArtifactClose?.({ messageId, artifactId, title });
      }
    }

    // Return the visible text parts only (before + after artifact block)
    const visible = [beforeArtifact, afterArtifact].filter(Boolean).join('\n').trim();
    return visible;
  }

  /** Clear the deduplication guard so artifacts are re-processed on next parse. */
  reset(): void {
    this.processedArtifacts.clear();
  }
}