import type { Message } from 'ai';
import { useCallback, useState } from 'react';
import { EnhancedStreamingMessageParser } from '~/lib/runtime/enhanced-message-parser';
import { workbenchStore } from '~/lib/stores/workbench';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useMessageParser');

const messageParser = new EnhancedStreamingMessageParser({
  callbacks: {
    onArtifactOpen: (data) => {
      logger.trace('onArtifactOpen', data.artifactId);
      workbenchStore.showWorkbench.set(true);
      workbenchStore.addArtifact(data);
    },
    onArtifactClose: (data) => {
      logger.trace('onArtifactClose', data.artifactId);
      workbenchStore.updateArtifact(data, { closed: true });
    },
    onActionOpen: (data) => {
      const actionType = data.type ?? data.action?.type;
      logger.trace('onActionOpen', actionType, data.filePath);

      // File actions: add immediately so the file tab appears right away
      if (actionType === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      const actionType = data.type ?? data.action?.type;
      logger.trace('onActionClose', actionType, data.filePath);

      // Non-file actions (shell / start) are added on close (they arrive complete)
      if (actionType !== 'file') {
        workbenchStore.addAction(data);
      }

      workbenchStore.runAction(data);
    },
    onActionStream: (data) => {
      logger.trace('onActionStream', data.action);
      workbenchStore.runAction(data, true);
    },
  },
});

const extractTextContent = (message: Message) =>
  Array.isArray(message.content)
    ? (message.content.find((item) => item.type === 'text')?.text as string) || ''
    : (message.content as string);

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});

  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    /*
     * On every call we RESET the parser state and re-parse ALL messages from
     * scratch so that:
     *   1. Artifact deduplication guard prevents duplicate workbench actions
     *   2. Partial artifact content is suppressed (not leaked to chat)
     *   3. parsedMessages always reflects the CURRENT full content (no stale
     *      streaming chunks accumulate in the chat bubble)
     *
     * In production (non-DEV) we also reset unless we are mid-stream, so that
     * switching API keys or reloading a chat always produces a clean parse.
     *
     * The EnhancedStreamingMessageParser.reset() only clears the deduplication
     * Set — it does NOT re-fire callbacks for artifacts that were already fully
     * processed and stored in workbenchStore.  Re-processing after stream end
     * is safe because addArtifact / addAction in workbenchStore are idempotent.
     */
    if (!isLoading) {
      // Stream finished — full reset so a future API key change starts fresh
      messageParser.reset();
    }

    const newParsed: { [key: number]: string } = {};

    for (const [index, message] of messages.entries()) {
      if (message.role === 'assistant' || message.role === 'user') {
        // parse() returns the text to display (artifacts suppressed / stripped)
        newParsed[index] = messageParser.parse(message.id, extractTextContent(message));
      }
    }

    // ALWAYS SET — never append — because parse() processes the full content
    setParsedMessages(newParsed);
  }, []);

  return { parsedMessages, parseMessages };
}