import { useStore } from '@nanostores/react';
import type { Message } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useAnimate } from 'framer-motion';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '~/lib/hooks';
import { description, useChatHistory } from '~/lib/persistence';
import { chatStore } from '~/lib/stores/chat';
import { workbenchStore } from '~/lib/stores/workbench';
import { DEFAULT_MODEL, DEFAULT_PROVIDER, PROMPT_COOKIE_KEY, PROVIDER_LIST } from '~/utils/constants';
import { cubicEasingFn } from '~/utils/easings';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { useSettings } from '~/lib/hooks/useSettings';
import type { ProviderInfo } from '~/types/model';
import { useSearchParams } from '@remix-run/react';
import { createSampler } from '~/utils/sampler';
import { getTemplates, selectStarterTemplate } from '~/utils/selectStarterTemplate';
import { logStore } from '~/lib/stores/logs';
import { streamingState } from '~/lib/stores/streaming';
import { filesToArtifacts } from '~/utils/fileUtils';
import { defaultDesignScheme, type DesignScheme } from '~/types/design-scheme';
import type { ElementInfo } from '~/components/workbench/Inspector';
import type { TextUIPart, FileUIPart, Attachment } from '@ai-sdk/ui-utils';
import { useMCPStore } from '~/lib/stores/mcp';
import type { LlmErrorAlertType } from '~/types/actions';
import AgentProgress from '~/components/agent/AgentProgress';
import { chatId } from '~/lib/persistence/useChatHistory';
import { useParams } from '@remix-run/react';

const logger = createScopedLogger('Chat');

export function Chat() {
  renderLogger.trace('Chat');
  const params = useParams();

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);

  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
          <ChatImpl
      key={params.id || 'home'}
      description={title}
      initialMessages={initialMessages}
      exportChat={exportChat}
      storeMessageHistory={storeMessageHistory}
      importChat={importChat}
      />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: Message[];
    initialMessages: Message[];
    isLoading: boolean;
    parseMessages: (messages: Message[], isLoading: boolean) => void;
    storeMessageHistory: (messages: Message[], files?: Record<string, any>, skipContainerRead?: boolean) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages, workbenchStore.files.get(), true).catch((error) => toast.error(error.message));
    }
  },
  1500,
);

interface ChatProps {
  initialMessages: Message[];
  storeMessageHistory: (messages: Message[], files?: Record<string, any>, skipContainerRead?: boolean) => Promise<void>;
  importChat: (description: string, messages: Message[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [chatStarted, setChatStarted] = useState(initialMessages.length > 0);
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const [searchParams, setSearchParams] = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    const files = useStore(workbenchStore.files);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.actionAlert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const mcpSettings = useMCPStore((state) => state.settings);

    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || DEFAULT_MODEL;
    });

    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return (PROVIDER_LIST.find((p) => p.name === savedProvider) || DEFAULT_PROVIDER) as ProviderInfo;
    });

    const { showChat } = useStore(chatStore);
    const [animationScope, animate] = useAnimate();
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);

    // Agent states
    const [agentRunId, setAgentRunId] = useState<number | null>(null);
    const [agentRunning, setAgentRunning] = useState(false);
    const isAgentRunningRef = useRef(false);

    // ⚠️ FIX: holds the message that's waiting for the backend orchestrator (/api/agent)
    // once the main /api/chat stream finishes — see onFinish below. This is what lets us
    // sequence the two LLM calls instead of firing them at the same instant.
    const pendingAgentMessageRef = useRef<string | null>(null);

    const {
      messages,
      isLoading,
      input,
      handleInputChange,
      setInput,
      stop,
      append,
      setMessages,
      reload,
      error,
      data: chatData,
      setData,
      addToolResult,
    } = useChat({
      api: '/api/chat',
      body: {
        apiKeys,
        files,
        promptId,
        contextOptimization: contextOptimizationEnabled,
        chatMode,
        designScheme,
        maxLLMSteps: mcpSettings.maxLLMSteps,
      },
      sendExtraMessageFields: true,
      onError: (e) => {
        setFakeLoading(false);
        // If chat generation itself failed (e.g. rate/token limit), don't also fire
        // the agent for this message — it would just add to the same problem.
        pendingAgentMessageRef.current = null;
        handleError(e, 'chat');
      },
      onFinish: (message, response) => {
        const usage = response.usage;
        setData(undefined);

        if (usage) {
          console.log('Token usage:', usage);
          logStore.logProvider('Chat response completed', {
            component: 'Chat',
            action: 'response',
            model,
            provider: provider.name,
            usage,
            messageLength: message.content.length,
          });
        }

        logger.debug('Finished streaming');

        // ⚠️ FIX: run the backend orchestrator (/api/agent — which itself makes at
        // least one LLM call for planning, and more if it decides backend work is
        // needed) only AFTER the main /api/chat stream is fully done, instead of at
        // the same instant sendMessage() fires. Both calls hit the same Groq
        // free-tier TPM budget; firing them together was bursting past that limit
        // even for trivial prompts. Sequencing spreads the same total tokens across
        // a longer window instead of consuming them all at once. The agent itself
        // is untouched — it still runs on every message, still decides what (if
        // anything) backend-related is needed; only the timing changed.
        if (pendingAgentMessageRef.current) {
          const contentForAgent = pendingAgentMessageRef.current;
          pendingAgentMessageRef.current = null;
          runAgent(contentForAgent);
        }
      },
      initialMessages,
      initialInput: '',
    });

    useEffect(() => {
      const prompt = searchParams.get('prompt');

      if (prompt) {
        setSearchParams({});
        runAnimation();
        // ⚠️ FIX: this path (starting a brand-new project from the homepage's
        // initial prompt box) called append() directly without ever setting
        // pendingAgentMessageRef — meaning the backend orchestrator (/api/agent)
        // NEVER ran for a project's first message, only for later ones typed
        // into the chat box via sendMessage(). Since the first message usually
        // carries the actual requirements, this meant backend/database
        // generation silently never happened for new projects.
        pendingAgentMessageRef.current = prompt;
        append({
          role: 'user',
          content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`,
        });
      }
    }, [model, provider, searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = chatStarted ? 400 : 200;

    useEffect(() => {
      chatStore.setKey('started', initialMessages.length > 0);
    }, []);

    useEffect(() => {
      parseMessages(messages, isLoading);

      if (messages.length > initialMessages.length) {
        if (isLoading) {
          // While streaming, use 1.5s sampled persistence with container read skipped
          processSampledMessages({ messages, initialMessages, isLoading, parseMessages, storeMessageHistory });
        } else {
          // When streaming finishes, save immediately in next tick with full container read
          setTimeout(() => {
            storeMessageHistory(messages, workbenchStore.files.get(), false).catch((error) => toast.error(error.message));
          }, 0);
        }
      }
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        logger.error(`${context} request failed`, error);
        stop();
        setFakeLoading(false);

        let errorInfo = {
          message: 'An unexpected error occurred',
          isRetryable: true,
          statusCode: 500,
          provider: provider.name,
          type: 'unknown' as const,
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);
            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        let errorType: LlmErrorAlertType['errorType'] = 'unknown';
        let title = 'Request Failed';

        if (errorInfo.statusCode === 401 || errorInfo.message.toLowerCase().includes('api key')) {
          errorType = 'authentication';
          title = 'Authentication Error';
        } else if (errorInfo.statusCode === 429 || errorInfo.message.toLowerCase().includes('rate limit')) {
          errorType = 'rate_limit';
          title = 'Rate Limit Exceeded';
        } else if (errorInfo.message.toLowerCase().includes('quota')) {
          errorType = 'quota';
          title = 'Quota Exceeded';
        } else if (errorInfo.statusCode >= 500) {
          errorType = 'network';
          title = 'Server Error';
        }

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: errorInfo.message,
          context,
          retryable: errorInfo.isRetryable,
          errorType,
          provider: provider.name,
        });

        setLlmErrorAlert({
          type: 'error',
          title,
          description: errorInfo.message,
          provider: provider.name,
          errorType,
        });
        setData([]);
      },
      [provider.name, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        textarea.style.height = 'auto';
        const scrollHeight = textarea.scrollHeight;
        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    const runAnimation = async () => {
      if (chatStarted) return;

      await Promise.all([
        animate('#examples', { opacity: 0, display: 'none' }, { duration: 0.1 }),
        animate('#intro', { opacity: 0, flex: 1 }, { duration: 0.2, ease: cubicEasingFn }),
      ]);

      chatStore.setKey('started', true);
      setChatStarted(true);
    };

    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      const parts: Array<TextUIPart | FileUIPart> = [{ type: 'text', text }];

      images.forEach((imageData) => {
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    const filesToAttachments = async (files: File[]): Promise<Attachment[] | undefined> => {
      if (files.length === 0) return undefined;

      const attachments = await Promise.all(
        files.map(
          (file) =>
            new Promise<Attachment>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => {
                resolve({
                  name: file.name,
                  contentType: file.type,
                  url: reader.result as string,
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      return attachments;
    };

    // Agent runner
    const runAgent = async (messageContent: string) => {
      console.log('🔍 runAgent called, isAgentRunning:', isAgentRunningRef.current, 'chatId:', chatId.get());

      if (isAgentRunningRef.current) {
        console.log('🔍 runAgent skipped — an agent run is already in progress');
        return;
      }

      isAgentRunningRef.current = true;
      setAgentRunning(true);

      // chatId nahi hai toh naya banao
      let currentChatId = chatId.get();
      if (!currentChatId) {
        currentChatId = String(Date.now());
        chatId.set(currentChatId);
        // ✅ URL update karo taake history save ho
        const url = new URL(window.location.href);
        url.pathname = `/chat/${currentChatId}`;
        window.history.replaceState({}, '', url);
      }

      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userRequest: messageContent,
            chatId: currentChatId,
          }),
        });

        const result = await res.json() as any;
        console.log('🤖 Agent result:', result.success, 'files:', Object.keys(result.files || {}).length);

        if (result.success && result.runId) {
          setAgentRunId(result.runId);
        }

        if (result.success && result.files && Object.keys(result.files).length > 0) {
          const { webcontainer } = await import('~/lib/webcontainer');
          const container = await webcontainer;

          // Write files to WebContainer filesystem
          for (const [filePath, content] of Object.entries(result.files as Record<string, string>)) {
            const cleanPath = filePath.startsWith('/') ? filePath : '/' + filePath;
            try {
              const dir = cleanPath.substring(0, cleanPath.lastIndexOf('/'));
              if (dir && dir !== '/') {
                await container.fs.mkdir(dir, { recursive: true });
              }
              await container.fs.writeFile(cleanPath, content, { encoding: 'utf8' });
            } catch (e) {
              console.error('Failed to write file:', cleanPath, e);
            }
          }

          // Inject into workbench store
          const fileMap = Object.fromEntries(
            Object.entries(result.files as Record<string, string>).map(([p, c]) => [
              p.replace(/^\/+/, ''),
              { type: 'file' as const, content: c, isBinary: false },
            ])
          );

          for (const [path, dirent] of Object.entries(fileMap)) {
            workbenchStore.files.setKey(path, dirent);
          }

          workbenchStore.setDocuments(fileMap);
          workbenchStore.showWorkbench.set(true);

          // Start dev server (and backend if the project needs one)
          try {
            const hasPackageJson = 'package.json' in result.files;
            if (hasPackageJson) {
              console.log('📦 Running npm install...');
              const installProc = await container.spawn('npm', ['install']);
              await installProc.exit;

              // ── Item 1 fix: detect backend need the same way coder.agent.ts does ──
              // coder.agent.ts sets needsBackend by checking apiRoutes/databaseSchema
              // in the architecture, and when true writes files under server/.
              // We mirror that check here by looking for any server/ file in result.files.
              const hasServerFiles = Object.keys(result.files as Record<string, string>)
                .some((p) => p.startsWith('server/') || p.startsWith('/server/'));

              if (hasServerFiles) {
                console.log('🖥️ Backend detected — starting server on port 3001...');
                // Spawn backend concurrently; pass PORT explicitly so the proxy target
                // (http://localhost:3001 in vite.config.ts) is always correct regardless
                // of what process.env.PORT the generated server reads.
                const serverProc = await container.spawn('node', ['server/index.js'], {
                  env: { PORT: '3001' },
                });
                serverProc.output.pipeTo(
                  new WritableStream({ write(data) { console.log('[agent-server]', data); } })
                );
              }
              // ─────────────────────────────────────────────────────────────────────

              console.log('🚀 Starting dev server...');
              const devProc = await container.spawn('npm', ['run', 'dev']);
              devProc.output.pipeTo(
                new WritableStream({ write(data) { console.log('[agent-dev]', data); } })
              );
            }
          } catch (e) {
            console.error('Failed to start dev server:', e);
          }

          // ✅ History save after agent completes
          await storeMessageHistory(messages, workbenchStore.files.get(), false);
        }
      } catch (e) {
        console.error('Agent error:', e);
      } finally {
        isAgentRunningRef.current = false;
        setAgentRunning(false);
      }
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) return;

      if (isLoading) {
        abort();
        return;
      }

      let finalMessageContent = messageContent;

      if (selectedElement) {
        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }
        append({
        role: 'user',
        content: messageContent,
        parts: createMessageParts(messageContent, imageDataList), 
        });
      // ⚠️ FIX: don't fire the backend agent right now — queue it, it'll run in
      // onFinish once /api/chat's stream completes (see comment there for why).
      pendingAgentMessageRef.current = messageContent;

      runAnimation();

      if (!chatStarted) {
        setFakeLoading(true);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }
              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  annotations: ['hidden'],
                },
              ]);

              const reloadOptions =
                uploadedFiles.length > 0
                  ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
                  : undefined;

              reload(reloadOptions);
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);
              setUploadedFiles([]);
              setImageDataList([]);
              resetEnhancer();
              textareaRef.current?.blur();
              setFakeLoading(false);
              return;
            }
          }
        }

        const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;
        const attachments = uploadedFiles.length > 0 ? await filesToAttachments(uploadedFiles) : undefined;

        setMessages([
          {
            id: `${new Date().getTime()}`,
            role: 'user',
            content: userMessageText,
            parts: createMessageParts(userMessageText, imageDataList),
            experimental_attachments: attachments,
          },
        ]);

        reload(attachments ? { experimental_attachments: attachments } : undefined);
        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);
        setUploadedFiles([]);
        setImageDataList([]);
        resetEnhancer();
        textareaRef.current?.blur();
        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();
      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0
            ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
            : undefined;

        append(
          { role: 'user', content: messageText, parts: createMessageParts(messageText, imageDataList) },
          attachmentOptions,
        );

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

        const attachmentOptions =
          uploadedFiles.length > 0
            ? { experimental_attachments: await filesToAttachments(uploadedFiles) }
            : undefined;

        append(
          { role: 'user', content: messageText, parts: createMessageParts(messageText, imageDataList) },
          attachmentOptions,
        );
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);
      setUploadedFiles([]);
      setImageDataList([]);
      resetEnhancer();
      textareaRef.current?.blur();
    };

    const onTextareaChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      handleInputChange(event);
    };

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');
      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;
        const syntheticEvent = {
          target: { value: newInput },
        } as React.ChangeEvent<HTMLTextAreaElement>;
        handleInputChange(syntheticEvent);
      },
      [input, handleInputChange],
    );

    return (
      <>
        <BaseChat
          ref={animationScope}
          textareaRef={textareaRef}
          input={input}
          showChat={showChat}
          chatStarted={chatStarted}
          isStreaming={isLoading || fakeLoading || agentRunning}
          onStreamingChange={(streaming) => { streamingState.set(streaming); }}
          enhancingPrompt={enhancingPrompt}
          promptEnhanced={promptEnhanced}
          sendMessage={sendMessage}
          model={model}
          setModel={handleModelChange}
          provider={provider}
          setProvider={handleProviderChange}
          providerList={activeProviders}
          handleInputChange={(e) => { onTextareaChange(e); }}
          handleStop={abort}
          description={description}
          importChat={importChat}
          exportChat={exportChat}
          messages={messages.map((message, i) => {
            if (message.role === 'user') return message;
            return { ...message, content: parsedMessages[i] || '' };
          })}
          enhancePrompt={() => {
            enhancePrompt(
              input,
              (input) => { setInput(input); scrollTextArea(); },
              model,
              provider,
              apiKeys,
            );
          }}
          uploadedFiles={uploadedFiles}
          setUploadedFiles={setUploadedFiles}
          imageDataList={imageDataList}
          setImageDataList={setImageDataList}
          actionAlert={actionAlert}
          clearAlert={() => workbenchStore.clearAlert()}
          deployAlert={deployAlert}
          clearDeployAlert={() => workbenchStore.clearDeployAlert()}
          llmErrorAlert={llmErrorAlert}
          clearLlmErrorAlert={clearApiErrorAlert}
          data={chatData}
          chatMode={chatMode}
          setChatMode={setChatMode}
          append={append}
          reload={reload}
          designScheme={designScheme}
          setDesignScheme={setDesignScheme}
          selectedElement={selectedElement}
          setSelectedElement={setSelectedElement}
          addToolResult={addToolResult}
          onWebSearchResult={handleWebSearchResult}
        />
        {/* ⚠️ Hidden from end users on purpose — internal agent orchestration
            progress (including failure states like a red "Generating Sample
            Data" X) is confusing/unprofessional for customer-facing use.
            Kept in the codebase (and the SSE backend below still runs with
            its 15-min timeout) in case an internal/debug view is wanted
            later — just not shown to the end user for now. */}
        <AgentProgress
          runId={agentRunId}
          onComplete={() => setAgentRunId(null)}
        />
      </>
    );
  },
);