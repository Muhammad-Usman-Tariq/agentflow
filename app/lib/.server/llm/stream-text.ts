import { convertToCoreMessages, streamText as _streamText, type Message } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { getSystemPrompt } from '~/lib/common/prompts/prompts';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, MODIFICATIONS_TAG_NAME, PROVIDER_LIST, WORK_DIR } from '~/utils/constants';
import type { IProviderSetting } from '~/types/model';
import { PromptLibrary } from '~/lib/common/prompt-library';
import { allowedHTMLElements } from '~/utils/markdown';
import { createScopedLogger } from '~/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { discussPrompt } from '~/lib/common/prompts/discuss-prompt';
import type { DesignScheme } from '~/types/design-scheme';

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
  env?: Env;
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

  const currentProvider = envAny?.PROVIDER_NAME || envAny?.['PROVIDER_NAME'] || '';
  const currentModel = envAny?.DEFAULT_MODEL || DEFAULT_MODEL;
  const currentApiKey = envAny?.PROVIDER_API_KEY || '';

  logger.info(`Using Provider: ${currentProvider}, Model: ${currentModel}, Key: ${currentApiKey ? 'SET' : 'MISSING'}`);

  // ⚠️ FIX: this is the final choke point before the LLM call, so it's the last line
  // of defense — the env-configured provider's key ALWAYS comes from env, full stop.
  // Any caller-supplied `apiKeys` (there shouldn't be any now that api.chat.ts and
  // api.llmcall.ts no longer read cookies) can only ever apply to a DIFFERENT
  // provider than the one .env configures; they can never override it.
  const finalApiKeys: Record<string, string> = { ...apiKeys };
  if (currentProvider) {
    finalApiKeys[currentProvider] = currentApiKey;
  }

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

  const provider = PROVIDER_LIST.find((p) => p.name.toLowerCase() === currentProvider.toLowerCase()) || DEFAULT_PROVIDER;

  const modelDetails = {
    name: currentModel,
    provider: currentProvider,
    maxTokenAllowed: 200000,
    maxCompletionTokens: 3000,
  };

  const safeMaxTokens = 3000;

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
    systemPrompt = `${systemPrompt}\n\nIMPORTANT: These files are locked — do NOT modify:\n${lockedList}\n---\n`;
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
        // temp debug
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