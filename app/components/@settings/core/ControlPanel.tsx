import { useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { classNames } from '~/utils/classNames';
import { DialogTitle } from '~/components/ui/Dialog';
import BackgroundRays from '~/components/ui/BackgroundRays';
import GitHubTab from '~/components/@settings/tabs/github/GitHubTab';
import GitLabTab from '~/components/@settings/tabs/gitlab/GitLabTab';
import VercelTab from '~/components/@settings/tabs/vercel/VercelTab';
import NetlifyTab from '~/components/@settings/tabs/netlify/NetlifyTab';

interface ControlPanelProps {
  open: boolean;
  onClose: () => void;
}

type TabType = 'vercel' | 'netlify' | 'github' | 'gitlab';

const TABS: { id: TabType; label: string; icon: string; logo: string }[] = [
  {
    id: 'vercel',
    label: 'Vercel',
    icon: '▲',
    logo: 'https://cdn.simpleicons.org/vercel/white',
  },
  {
    id: 'netlify',
    label: 'Netlify',
    icon: '✦',
    logo: 'https://cdn.simpleicons.org/netlify',
  },
  {
    id: 'github',
    label: 'GitHub',
    icon: '🐙',
    logo: 'https://cdn.simpleicons.org/github/white',
  },
  {
    id: 'gitlab',
    label: 'GitLab',
    icon: '🦊',
    logo: 'https://cdn.simpleicons.org/gitlab',
  },
];

export const ControlPanel = ({ open, onClose }: ControlPanelProps) => {
  const [activeTab, setActiveTab] = useState<TabType>('vercel');

  const renderTab = () => {
    switch (activeTab) {
      case 'vercel': return <VercelTab />;
      case 'netlify': return <NetlifyTab />;
      case 'github': return <GitHubTab />;
      case 'gitlab': return <GitLabTab />;
    }
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm" />
        <RadixDialog.Content
          className={classNames(
            'fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
            'z-[10000] w-[900px] max-h-[85vh]',
            'rounded-2xl overflow-hidden flex',
            'shadow-2xl',
          )}
          style={{
            background: 'linear-gradient(135deg, #0f0f12 0%, #13131a 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <DialogTitle className="sr-only">Settings</DialogTitle>
          <BackgroundRays />

          {/* Sidebar */}
          <div
            className="w-52 flex flex-col flex-shrink-0 py-4"
            style={{ borderRight: '1px solid rgba(255,255,255,0.06)' }}
          >
            {/* Header */}
            <div className="px-4 mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Connections
              </p>
            </div>

            {/* Tabs */}
            <div className="flex-1 px-3 space-y-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={classNames(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all',
                    activeTab === tab.id
                      ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
                  )}
                >
                  <img
                    src={tab.logo}
                    alt={tab.label}
                    className="w-4 h-4 object-contain flex-shrink-0"
                    crossOrigin="anonymous"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs text-gray-600">DigitalSofts v1.0</p>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Content Header */}
            <div
              className="flex items-center justify-between px-6 py-4 flex-shrink-0"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
            >
              <h2 className="font-semibold text-white text-base">
                {TABS.find(t => t.id === activeTab)?.label} Settings
              </h2>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/5 transition-all"
              >
                ✕
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {renderTab()}
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
};