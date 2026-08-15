import type { Message } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';
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
      if (actionType === 'file') {
        workbenchStore.addAction(data);
      }
    },
    onActionClose: (data) => {
      const actionType = data.type ?? data.action?.type;
      logger.trace('onActionClose', actionType, data.filePath);
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

/**
 * Run a full parse pass over all messages and return the display map.
 * This is extracted so we can call it both from parseMessages and from the
 * isLoading=false forced-flush below.
 */
function runFullParse(messages: Message[]): { [key: number]: string } {
  const result: { [key: number]: string } = {};
  for (const [index, message] of messages.entries()) {
    if (message.role === 'assistant' || message.role === 'user') {
      const raw = extractTextContent(message);
      const parsed = messageParser.parse(message.id, raw);
      // For assistant messages: if parsed is empty but raw exists, show a
      // placeholder so the user knows something was generated (workbench shows it)
      if (message.role === 'assistant' && parsed === '' && raw.includes('<boltArtifact')) {
        result[index] = '\u2009'; // thin space — visible but blank, prevents dots
      } else {
        result[index] = parsed;
      }
    }
  }
  return result;
}

export function useMessageParser() {
  const [parsedMessages, setParsedMessages] = useState<{ [key: number]: string }>({});
  // Keep a ref to the latest messages so we can force-flush after stream ends
  const latestMessagesRef = useRef<Message[]>([]);

  /**
   * parseMessages is called by processSampledMessages which is rate-limited
   * to 50 ms.  That means the FINAL call (isLoading=false) may arrive while
   * the sampler is still cooling down and gets silently dropped.
   *
   * Strategy:
   *   • During streaming  → parse & set immediately (sampler handles throttle)
   *   • When stream ends  → schedule a guaranteed flush via setTimeout(0) so it
   *     runs outside the sampler's cooldown window
   */
  const parseMessages = useCallback((messages: Message[], isLoading: boolean) => {
    latestMessagesRef.current = messages;

    if (!isLoading) {
      // Stream just ended — reset so artifacts re-run their workbench callbacks
      // on the final, complete content.
      messageParser.reset();

      // Defer the final parse slightly so it definitely runs AFTER the sampler
      // cooldown; this guarantees parsedMessages is populated on stream end.
      setTimeout(() => {
        const parsed = runFullParse(latestMessagesRef.current);
        setParsedMessages(parsed);
      }, 0);
    } else {
      // Mid-stream — parse current snapshot and show it
      const parsed = runFullParse(messages);
      setParsedMessages(parsed);
    }
  }, []);

  return { parsedMessages, parseMessages };
}