import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, isReasoningModel, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { MODIFICATIONS_TAG_NAME, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import type { DesignScheme } from '~/types/design-scheme';
import { resolveLLMConfig } from './resolve-provider';

export type Messages = Message[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

function sanitizeText(text: string): string {
  let sanitized = text.replace(/<div class=\\"__boltThought__\\">.*?<\/div>/s, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/s, '');
  sanitized = sanitized.replace(/<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g, '');
  return sanitized.trim();
}

export async function streamText(props: {
  messages: Omit<Message, 'id'>[];
  env?: Env | Record<string, string>;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
  } = props;

  const envAny = serverEnv as any;
  console.log('ENV DUMP:', JSON.stringify(envAny));

  const defaultConfig = resolveLLMConfig(envAny);

  let currentProvider = defaultConfig.providerName;
  let provider = defaultConfig.provider;
  let currentModel = defaultConfig.model;
  let currentApiKey = defaultConfig.apiKey;

  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };
    if (message.role === 'user') {
      const { content } = extractPropertiesFromMessage(message);
      newMessage.content = sanitizeText(content);
    } else if (message.role === 'assistant') {
      newMessage.content = sanitizeText(message.content as string);
    }
    if (Array.isArray(message.parts)) {
      newMessage.parts = message.parts.map((part) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }
    return newMessage;
  });

  logger.info(`Using Provider: ${currentProvider}, Model: ${currentModel}, Key: ${currentApiKey ? 'SET' : 'MISSING'}`);

  const finalApiKeys: Record<string, string> = { ...apiKeys };
  if (currentProvider && currentApiKey) {
    finalApiKeys[currentProvider] = currentApiKey;
  }

  const modelDetails = {
    name: currentModel,
    provider: currentProvider,
    maxTokenAllowed: 200000,
    maxCompletionTokens: 8192,
  };

  const safeMaxTokens = defaultConfig.maxTokens || 4000;

 logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);
  console.log('chatMode:', chatMode);
let systemPrompt =
    PromptLibrary.getPropmtFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? getSystemPrompt();

  if (chatMode === 'build' && contextFiles && contextOptimization) {
    const codeContext = createFilesContext(contextFiles, true);
    systemPrompt = `${systemPrompt}\n\nCONTEXT BUFFER:\n---\n${codeContext}\n---\n`;
    if (summary) {
      systemPrompt = `${systemPrompt}\nCHAT SUMMARY:\n---\n${props.summary}\n---\n`;
      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();
        if (lastMessage) processedMessages = [lastMessage];
      }
    }
  }

  const effectiveLockedFilePaths = new Set<string>();
  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) effectiveLockedFilePaths.add(filePath);
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedList = Array.from(effectiveLockedFilePaths).map((f) => `- ${f}`).join('\n');
    systemPrompt = `${systemPrompt}\n\nIMPORTANT: These files are locked - do NOT modify:\n${lockedList}\n---\n`;
  } else {
    console.log('No locked files found from any source for prompt.');
  }

  const isReasoning = isReasoningModel(modelDetails.name);
  const tokenParams = isReasoning ? { maxCompletionTokens: safeMaxTokens } : { maxTokens: safeMaxTokens };

  const filteredOptions =
    isReasoning && options
      ? Object.fromEntries(
          Object.entries(options).filter(
            ([key]) => !['temperature','topP','presencePenalty','frequencyPenalty','logprobs','topLogprobs','logitBias'].includes(key),
          ),
        )
      : options || {};
      console.log('chatMode:', chatMode);
      const streamParams = {
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys: finalApiKeys,
      providerSettings,
    }),
    system: chatMode === 'discuss' ? discussPrompt() : systemPrompt,
    ...tokenParams,
    messages: convertToCoreMessages(processedMessages as any),
    ...filteredOptions,
    ...(isReasoning ? { temperature: 1 } : {}),
  };

  return await _streamText(streamParams);
}
