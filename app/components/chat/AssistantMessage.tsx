import { memo, Fragment, useState } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import Popover from '~/components/ui/Popover';
import { workbenchStore } from '~/lib/stores/workbench';
import { WORK_DIR } from '~/utils/constants';
import WithTooltip from '~/components/ui/Tooltip';
import type { Message } from 'ai';
import type { ProviderInfo } from '~/types/model';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolInvocationUIPart,
  SourceUIPart,
  FileUIPart,
  StepStartUIPart,
} from '@ai-sdk/ui-utils';
import { ToolInvocations } from './ToolInvocations';
import type { ToolCallAnnotation } from '~/types/context';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
  messageId?: string;
  onRewind?: (messageId: string) => void;
  onRefresh?: () => void;
  onEdit?: (newContent: string) => void;
  append?: (message: Message) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolInvocationUIPart | SourceUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function normalizedFilePath(path: string) {
  let normalizedPath = path;

  if (normalizedPath.startsWith(WORK_DIR)) {
    normalizedPath = path.replace(WORK_DIR, '');
  }

  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  return normalizedPath;
}

export const AssistantMessage = memo(
  ({
    content,
    annotations,
    messageId,
    onRewind,
    onRefresh,
    onEdit,
    append,
    chatMode,
    setChatMode,
    model,
    provider,
    parts,
    addToolResult,
  }: AssistantMessageProps) => {
    const [copied, setCopied] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const filteredAnnotations = (annotations?.filter(
      (annotation: JSONValue) =>
        annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
    ) || []) as { type: string; value: any } & { [key: string]: any }[];

    let chatSummary: string | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')) {
      chatSummary = filteredAnnotations.find((annotation) => annotation.type === 'chatSummary')?.summary;
    }

    let codeContext: string[] | undefined = undefined;

    if (filteredAnnotations.find((annotation) => annotation.type === 'codeContext')) {
      codeContext = filteredAnnotations.find((annotation) => annotation.type === 'codeContext')?.files;
    }

    const usage: {
      completionTokens: number;
      promptTokens: number;
      totalTokens: number;
    } = filteredAnnotations.find((annotation) => annotation.type === 'usage')?.value;

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');
    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    return (
      <div className="overflow-hidden w-full">
        <>
          <div className=" flex gap-2 items-center text-sm text-bolt-elements-textSecondary mb-2">
            {(codeContext || chatSummary) && (
              <Popover side="right" align="start" trigger={<div className="i-ph:info" />}>
                {chatSummary && (
                  <div className="max-w-chat">
                    <div className="summary max-h-96 flex flex-col">
                      <h2 className="border border-bolt-elements-borderColor rounded-md p4">Summary</h2>
                      <div style={{ zoom: 0.7 }} className="overflow-y-auto m4">
                        <Markdown>{chatSummary}</Markdown>
                      </div>
                    </div>
                    {codeContext && (
                      <div className="code-context flex flex-col p4 border border-bolt-elements-borderColor rounded-md">
                        <h2>Context</h2>
                        <div className="flex gap-4 mt-4 bolt" style={{ zoom: 0.6 }}>
                          {codeContext.map((x) => {
                            const normalized = normalizedFilePath(x);
                            return (
                              <Fragment key={normalized}>
                                <code
                                  className="bg-bolt-elements-artifacts-inlineCode-background text-bolt-elements-artifacts-inlineCode-text px-1.5 py-1 rounded-md text-bolt-elements-item-contentAccent hover:underline cursor-pointer"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    openArtifactInWorkbench(normalized);
                                  }}
                                >
                                  {normalized}
                                </code>
                              </Fragment>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="context"></div>
              </Popover>
            )}
            <div className="flex w-full items-center justify-between">
              {usage && (
                <div>
                  Tokens: {usage.totalTokens} (prompt: {usage.promptTokens}, completion: {usage.completionTokens})
                </div>
              )}
              {messageId && (
                <div className="flex gap-2 flex-col lg:flex-row ml-auto items-center">
                  {onRewind && (
                    <WithTooltip tooltip="Revert to this message">
                      <button
                        onClick={() => onRewind(messageId)}
                        key="i-ph:arrow-u-up-left"
                        className="i-ph:arrow-u-up-left text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                  {/* Bug 6: Refresh button — regenerates response */}
                  {onRefresh && (
                    <WithTooltip tooltip="Regenerate response">
                      <button
                        onClick={() => onRefresh()}
                        className="i-ph:arrow-clockwise text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                  {/* Bug 6: Edit button — inline edit + resubmit */}
                  {onEdit && (
                    <WithTooltip tooltip="Edit and resubmit">
                      <button
                        onClick={() => {
                          setEditText(content);
                          setIsEditing(true);
                        }}
                        className="i-ph:pencil-simple text-xl text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-colors"
                      />
                    </WithTooltip>
                  )}
                  {/* Bug 6: Copy button — same pattern as CodeBlock.tsx */}
                  <WithTooltip tooltip={copied ? 'Copied!' : 'Copy message'}>
                    <button
                      onClick={() => {
                        if (copied) return;
                        navigator.clipboard.writeText(content);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1500);
                      }}
                      className={`text-xl transition-colors ${
                        copied
                          ? 'i-ph:check text-green-500'
                          : 'i-ph:copy text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary'
                      }`}
                    />
                  </WithTooltip>
                </div>
              )}
            </div>
          </div>
        </>
        {/* Bug 6: Edit mode — inline editable textarea */}
        {isEditing && onEdit ? (
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              className="w-full min-h-[100px] p-3 rounded-lg border border-bolt-elements-borderColor bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary text-sm resize-y focus:outline-none focus:ring-2 focus:ring-bolt-elements-borderColorActive"
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 text-sm rounded-md border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-2 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (editText.trim()) {
                    onEdit(editText.trim());
                  }
                  setIsEditing(false);
                }}
                className="px-3 py-1.5 text-sm rounded-md bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        ) : (
          <>
            <Markdown append={append} chatMode={chatMode} setChatMode={setChatMode} model={model} provider={provider} html>
              {content}
            </Markdown>
            {toolInvocations && toolInvocations.length > 0 && (
              <ToolInvocations
                toolInvocations={toolInvocations}
                toolCallAnnotations={toolCallAnnotations}
                addToolResult={addToolResult}
              />
            )}
          </>
        )}
      </div>
    );
  },
);
