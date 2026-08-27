import { useState, useEffect } from 'react';

interface AgentTask {
  agentName: string;
  status: 'started' | 'done' | 'failed';
  completedAt?: string;
}

interface AgentProgressProps {
  runId: number | null;
  onComplete: (files: Record<string, string>) => void;
}

const AGENT_INFO: Record<string, { icon: string; label: string }> = {
  analyst:     { icon: 'i-ph:magnifying-glass', label: 'Analyzing Requirements' },
  architect:   { icon: 'i-ph:compass-tool', label: 'Designing Structure' },
  uiux:        { icon: 'i-ph:paint-brush', label: 'Making Design Decisions' },
  data:        { icon: 'i-ph:database', label: 'Generating Sample Data' },
  integration: { icon: 'i-ph:plugs', label: 'Setting Up Integrations' },
  coder:       { icon: 'i-ph:code', label: 'Writing Code' },
  reviewer:    { icon: 'i-ph:check-square-offset', label: 'Reviewing Quality' },
};

export default function AgentProgress({ runId, onComplete }: AgentProgressProps) {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [status, setStatus] = useState<'running' | 'done' | 'failed' | 'idle'>('idle');
  const [currentAgent, setCurrentAgent] = useState<string>('');
  // Bug 4 fix: allow manual dismiss; reset when a new run starts
  const [dismissed, setDismissed] = useState(false);

  // Reset dismiss state whenever a new run begins so the panel reappears
  useEffect(() => {
    if (runId) setDismissed(false);
  }, [runId]);

  useEffect(() => {
    if (!runId) return;

    setStatus('running');
    setTasks([]);

    // Connect to SSE stream
    const eventSource = new EventSource(`/api/agent/status?runId=${runId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'task_update') {
        setCurrentAgent(data.agentName);
        setTasks(prev => {
          const exists = prev.find(t => t.agentName === data.agentName);
          if (exists) {
            return prev.map(t =>
              t.agentName === data.agentName
                ? { ...t, status: data.status }
                : t
            );
          }
          return [...prev, {
            agentName: data.agentName,
            status: data.status,
            completedAt: data.completedAt,
          }];
        });
      }

      if (data.type === 'completed') {
        setStatus(data.status === 'done' ? 'done' : 'failed');
        eventSource.close();
        if (data.status === 'done') {
          onComplete({});
        }
      }

      if (data.type === 'error' || data.type === 'timeout') {
        setStatus('failed');
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [runId]);

  if (status === 'idle' || dismissed) return null;

  const completedCount = tasks.filter(t => t.status === 'done').length;
  const progressPercent = Math.round((completedCount / 7) * 100);

  return (
    <div className="fixed bottom-6 right-6 w-full max-w-[440px] bg-[#ffffff] border border-[#e8e4df] rounded-[16px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col z-50 animate-fade-in">

      {/* Header */}
      <div className="px-5 py-4 border-b border-[#e8e4df] flex justify-between items-center bg-[#f5f4f2]">
        <h2 className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#1f1b17] uppercase tracking-widest flex items-center gap-2">
          <div className="i-ph:brain-fill text-[#a93011] text-base" />
          <span>AGENT EXECUTION</span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold px-2 py-0.5 bg-[#fbf2eb] text-[#a93011] rounded-full">
            {status === 'running' ? 'RUNNING' : status === 'done' ? 'COMPLETE' : 'FAILED'}
          </span>
          {/* Bug 4 fix: dismiss button */}
          <button
            onClick={() => setDismissed(true)}
            title="Dismiss"
            className="ml-1 w-6 h-6 flex items-center justify-center rounded-full text-[#5f5e5e] hover:text-[#1f1b17] hover:bg-[#e8e4df] transition-colors text-sm leading-none"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Agent list */}
      <div className="p-4 flex flex-col gap-2.5 max-h-[300px] overflow-y-auto">
        {Object.entries(AGENT_INFO).map(([agentName, info]) => {
          const task = tasks.find(t => t.agentName === agentName);
          const isDone = task?.status === 'done';
          const isFailed = task?.status === 'failed';
          const isCurrent = currentAgent === agentName && status === 'running';

          return (
            <div
              key={agentName}
              className={`flex items-center justify-between p-2.5 rounded-lg border transition-all ${
                isDone
                  ? 'border-[#e8e4df] bg-[#f5f4f2]'
                  : isCurrent
                  ? 'border-[#cb4927] shadow-[0_0_0_1px_#ffb4a2] bg-[#ffffff]'
                  : isFailed
                  ? 'border-[#ba1a1a] bg-[#ffdad6]/40'
                  : 'border-transparent bg-transparent opacity-50'
              }`}
            >
              <div className="flex items-center gap-3">
                {isDone ? (
                  <div className="i-ph:check-circle-fill text-[#006579] text-lg" />
                ) : isCurrent ? (
                  <div className="w-3.5 h-3.5 rounded-full bg-[#a93011] animate-ping" />
                ) : isFailed ? (
                  <div className="i-ph:x-circle-fill text-[#ba1a1a] text-lg" />
                ) : (
                  <div className="i-ph:clock text-[#9d9893] text-lg" />
                )}
                <span className="font-[#JetBrains_Mono,monospace] text-[12px] text-[#1f1b17] font-medium">
                  {info.label}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isDone && (
                  <span className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold px-2 py-0.5 bg-[#b1ecff] text-[#001f27] rounded-full">
                    DONE
                  </span>
                )}
                {isCurrent && (
                  <span className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold px-2 py-0.5 bg-[#ffdad2] text-[#3c0700] rounded-full animate-pulse">
                    RUNNING
                  </span>
                )}
                {!task && (
                  <span className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold px-2 py-0.5 bg-[#eae1da] text-[#59413b] rounded-full">
                    WAITING
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer / Overall Progress */}
      <div className="p-4 border-t border-[#e8e4df] bg-[#fff8f4] flex flex-col gap-2">
        <div className="flex justify-between items-end text-[12px]">
          <span className="text-[#5f5e5e] font-medium">Overall Progress</span>
          <span className="font-[#JetBrains_Mono,monospace] font-bold text-[#1f1b17]">
            {progressPercent}%
          </span>
        </div>
        <div className="h-2 w-full bg-[#e8e4df] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#a93011] transition-all duration-300 rounded-full"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    </div>
  );
}