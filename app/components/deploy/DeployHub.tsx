import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { streamingState } from '~/lib/stores/streaming';
import { netlifyConnection } from '~/lib/stores/netlify';
import { vercelConnection } from '~/lib/stores/vercel';
import { isGitLabConnected } from '~/lib/stores/gitlabConnection';
import { useVercelDeploy } from '~/components/deploy/VercelDeploy.client';
import { useNetlifyDeploy } from '~/components/deploy/NetlifyDeploy.client';
import { useGitHubDeploy } from '~/components/deploy/GitHubDeploy.client';
import { useGitLabDeploy } from '~/components/deploy/GitLabDeploy.client';
import { GitHubDeploymentDialog } from '~/components/deploy/GitHubDeploymentDialog';
import { GitLabDeploymentDialog } from '~/components/deploy/GitLabDeploymentDialog';
import { workbenchStore } from '~/lib/stores/workbench';
import { useState as useSocialState, useEffect as useSocialEffect } from 'react';
import VercelTab from '~/components/@settings/tabs/vercel/VercelTab';
import NetlifyTab from '~/components/@settings/tabs/netlify/NetlifyTab';
import GitHubTab from '~/components/@settings/tabs/github/GitHubTab';
import GitLabTab from '~/components/@settings/tabs/gitlab/GitLabTab';

type MainTab = 'deploy' | 'social';
type DeployTab = 'overview' | 'vercel' | 'netlify' | 'github' | 'gitlab';

interface Platform {
  id: 'vercel' | 'netlify' | 'github' | 'gitlab';
  name: string;
  description: string;
  iconClass: string;
  accentColor: string;
}

const PLATFORMS: Platform[] = [
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Zero-config deployments with global edge CDN',
    iconClass: 'i-ph:cloud',
    accentColor: '#1f1b17',
  },
  {
    id: 'netlify',
    name: 'Netlify',
    description: 'Continuous deployment with instant rollbacks',
    iconClass: 'i-ph:planet',
    accentColor: '#00C7B7',
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Push to repository and trigger CI/CD pipelines',
    iconClass: 'i-ph:github-logo',
    accentColor: '#6e40c9',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    description: 'Complete DevOps platform with built-in CI/CD',
    iconClass: 'i-ph:git-pull-request',
    accentColor: '#FC6D26',
  },
];

export function DeployHub({ onClose }: { onClose: () => void }) {
  const [mainTab, setMainTab] = useState<MainTab>('deploy');
  const [deployTab, setDeployTab] = useState<DeployTab>('overview');
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployingTo, setDeployingTo] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState<string | null>(null);

  const netlifyConn = useStore(netlifyConnection);
  const vercelConn = useStore(vercelConnection);
  const gitlabIsConnected = useStore(isGitLabConnected);
  const isStreaming = useStore(streamingState);

  const { handleVercelDeploy } = useVercelDeploy();
  const { handleNetlifyDeploy } = useNetlifyDeploy();
  const { handleGitHubDeploy } = useGitHubDeploy();
  const { handleGitLabDeploy } = useGitLabDeploy();

  const [showGitHubDialog, setShowGitHubDialog] = useState(false);
  const [showGitLabDialog, setShowGitLabDialog] = useState(false);
  const [githubFiles, setGithubFiles] = useState<Record<string, string> | null>(null);
  const [gitlabFiles, setGitlabFiles] = useState<Record<string, string> | null>(null);
  const [githubProjectName] = useState('my-project');
  const [gitlabProjectName, setGitlabProjectName] = useState('my-project');

  const isConnected = (id: string) => {
    if (id === 'vercel') return !!vercelConn.user;
    if (id === 'netlify') return !!netlifyConn.user;
    if (id === 'github') return true;
    if (id === 'gitlab') return gitlabIsConnected;
    return false;
  };

  const handleDeploy = async (id: Platform['id']) => {
    if (isDeploying || isStreaming) return;
    setIsDeploying(true);
    setDeployingTo(id);
    setDeploySuccess(null);

    try {
      if (id === 'vercel') {
        await handleVercelDeploy();
        setDeploySuccess('vercel');
      } else if (id === 'netlify') {
        await handleNetlifyDeploy();
        setDeploySuccess('netlify');
      } else if (id === 'github') {
        const files = workbenchStore.files.get();
        const fileMap: Record<string, string> = {};
        for (const [path, dirent] of Object.entries(files)) {
          if (dirent?.type === 'file' && !dirent.isBinary) {
            fileMap[path] = dirent.content || '';
          }
        }
        setGithubFiles(fileMap);
        setShowGitHubDialog(true);
      } else if (id === 'gitlab') {
        const result = await handleGitLabDeploy();
        if (result && result.success && result.files) {
          setGitlabFiles(result.files);
          setGitlabProjectName(result.projectName);
          setShowGitLabDialog(true);
        }
      }
    } catch (e) {
      console.error('Deploy error:', e);
    } finally {
      setIsDeploying(false);
      setDeployingTo(null);
    }
  };

  const renderDeployContent = () => {
    if (deployTab === 'vercel') return <SettingsWrapper onBack={() => setDeployTab('overview')}><VercelTab /></SettingsWrapper>;
    if (deployTab === 'netlify') return <SettingsWrapper onBack={() => setDeployTab('overview')}><NetlifyTab /></SettingsWrapper>;
    if (deployTab === 'github') return <SettingsWrapper onBack={() => setDeployTab('overview')}><GitHubTab /></SettingsWrapper>;
    if (deployTab === 'gitlab') return <SettingsWrapper onBack={() => setDeployTab('overview')}><GitLabTab /></SettingsWrapper>;

    return (
      <div className="p-8 max-w-4xl mx-auto flex flex-col gap-8">
        <header>
          <h1 className="text-[28px] font-semibold text-[#1f1b17] tracking-tight">Deployment Targets</h1>
          <p className="text-[15px] text-[#5f5e5e] mt-1">Configure cloud deployment providers and launch your application.</p>
        </header>

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#fff8f4] border border-[#e8e4df] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#a93011]">
              {PLATFORMS.filter(p => isConnected(p.id)).length}
            </p>
            <p className="font-[#JetBrains_Mono,monospace] text-[11px] text-[#9d9893] uppercase tracking-wider mt-1">Connected</p>
          </div>
          <div className="bg-[#fff8f4] border border-[#e8e4df] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#1f1b17]">
              {PLATFORMS.length}
            </p>
            <p className="font-[#JetBrains_Mono,monospace] text-[11px] text-[#9d9893] uppercase tracking-wider mt-1">Platforms</p>
          </div>
          <div className="bg-[#fff8f4] border border-[#e8e4df] rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-[#006579]">
              {deploySuccess ? '1' : '0'}
            </p>
            <p className="font-[#JetBrains_Mono,monospace] text-[11px] text-[#9d9893] uppercase tracking-wider mt-1">Deployed</p>
          </div>
        </div>

        {/* Platform Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PLATFORMS.map((platform) => {
            const connected = isConnected(platform.id);
            const deploying = deployingTo === platform.id;
            const success = deploySuccess === platform.id;

            return (
              <div
                key={platform.id}
                className="bg-[#ffffff] border border-[#e8e4df] rounded-xl p-5 flex flex-col justify-between gap-4 hover:shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition-all"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#f5ece6] flex items-center justify-center text-[#a93011]">
                      <div className={`${platform.iconClass} text-xl`} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-[#1f1b17] text-[16px]">{platform.name}</h4>
                      {connected ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#fbf2eb] text-[#a93011] font-[#JetBrains_Mono,monospace] text-[10px] uppercase font-semibold mt-0.5">
                          Connected
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-[#e1d8d2]/40 text-[#5f5e5e] font-[#JetBrains_Mono,monospace] text-[10px] uppercase mt-0.5">
                          Disconnected
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <p className="text-[13px] text-[#5f5e5e]">{platform.description}</p>

                <div className="flex items-center gap-2 pt-2 border-t border-[#e8e4df]">
                  <button
                    onClick={() => setDeployTab(platform.id as DeployTab)}
                    className="flex-1 py-2 px-3 rounded-lg border border-[#e8e4df] text-[#5f5e5e] hover:text-[#1f1b17] hover:bg-[#f5f4f2] font-[#JetBrains_Mono,monospace] text-[11px] font-semibold uppercase tracking-wider transition-colors text-center"
                  >
                    {connected ? 'Settings' : 'Connect'}
                  </button>

                  {connected && (
                    <button
                      onClick={() => handleDeploy(platform.id)}
                      disabled={isDeploying || isStreaming}
                      className="flex-1 py-2 px-3 rounded-lg bg-[#a93011] text-white hover:bg-[#ad3313] font-[#JetBrains_Mono,monospace] text-[11px] font-semibold uppercase tracking-wider shadow-sm transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <div className="i-ph:rocket-launch text-[14px]" />
                      {deploying ? 'Deploying...' : 'Deploy'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[9998] bg-[#34302b]/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <div className="w-full max-w-5xl h-full max-h-[85vh] bg-[#ffffff] rounded-xl shadow-[0_1px_3px_rgba(0,0,0,0.06),0_24px_48px_rgba(0,0,0,0.04)] flex flex-col md:flex-row overflow-hidden border border-[#e8e4df] relative">
          
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-[#faf9f7] hover:bg-[#f5ece6] transition-colors text-[#9d9893] hover:text-[#1f1b17]"
          >
            <div className="i-ph:x text-lg" />
          </button>

          {/* Left Sidebar */}
          <aside className="w-full md:w-[260px] bg-[#f5f4f2] border-r border-[#e8e4df] flex flex-col shrink-0 p-6">
            <div className="mb-6">
              <h2 className="text-[20px] font-semibold text-[#1f1b17] tracking-tight">Deploy Hub</h2>
              <p className="text-[13px] text-[#9d9893] mt-1">Manage deployment targets & social integrations</p>
            </div>

            <nav className="flex-1 overflow-y-auto flex flex-col gap-1.5">
              <button
                onClick={() => { setMainTab('deploy'); setDeployTab('overview'); }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left w-full transition-colors ${
                  mainTab === 'deploy' && deployTab === 'overview'
                    ? 'border-l-[3px] border-[#a93011] bg-[#ffffff] text-[#a93011] font-bold shadow-sm'
                    : 'border-l-[3px] border-transparent text-[#5f5e5e] hover:text-[#1f1b17] hover:bg-[#fbf2eb]'
                }`}
              >
                <div className="i-ph:cloud text-lg" />
                <span className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold uppercase tracking-wider">Deploy Overview</span>
              </button>

              {PLATFORMS.map((platform) => (
                <button
                  key={platform.id}
                  onClick={() => { setMainTab('deploy'); setDeployTab(platform.id as DeployTab); }}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-left w-full transition-colors ${
                    mainTab === 'deploy' && deployTab === platform.id
                      ? 'border-l-[3px] border-[#a93011] bg-[#ffffff] text-[#a93011] font-bold shadow-sm'
                      : 'border-l-[3px] border-transparent text-[#5f5e5e] hover:text-[#1f1b17] hover:bg-[#fbf2eb]'
                  }`}
                >
                  <div className={`${platform.iconClass} text-lg`} />
                  <span className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold uppercase tracking-wider">{platform.name}</span>
                </button>
              ))}

              <button
                onClick={() => setMainTab('social')}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg text-left w-full transition-colors mt-2 ${
                  mainTab === 'social'
                    ? 'border-l-[3px] border-[#a93011] bg-[#ffffff] text-[#a93011] font-bold shadow-sm'
                    : 'border-l-[3px] border-transparent text-[#5f5e5e] hover:text-[#1f1b17] hover:bg-[#fbf2eb]'
                }`}
              >
                <div className="i-ph:share-network text-lg" />
                <span className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold uppercase tracking-wider">Social Media</span>
              </button>
            </nav>
          </aside>

          {/* Main Content Area */}
          <main className="flex-1 flex flex-col h-full bg-[#ffffff] relative overflow-y-auto">
            {mainTab === 'deploy' && renderDeployContent()}
            {mainTab === 'social' && <SocialIntegrationsPanel />}
          </main>
        </div>
      </div>

      {/* GitHub Dialog */}
      {showGitHubDialog && githubFiles && (
        <GitHubDeploymentDialog
          isOpen={showGitHubDialog}
          onClose={() => setShowGitHubDialog(false)}
          files={githubFiles}
          projectName={githubProjectName}
        />
      )}

      {/* GitLab Dialog */}
      {showGitLabDialog && gitlabFiles && (
        <GitLabDeploymentDialog
          isOpen={showGitLabDialog}
          onClose={() => setShowGitLabDialog(false)}
          files={gitlabFiles}
          projectName={gitlabProjectName}
        />
      )}
    </>
  );
}

// Settings wrapper component
function SettingsWrapper({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="p-6">
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-[13px] text-[#5f5e5e] hover:text-[#1f1b17] mb-6 transition-colors font-medium"
      >
        <div className="i-ph:arrow-left text-base" />
        Back to Deploy Overview
      </button>
      {children}
    </div>
  );
}

// Social Integrations Panel — matches Stitch screenshot exactly
const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'X (Twitter)', iconClass: 'i-ph:twitter-logo-fill', iconColor: '#1f1b17', bgColor: '#f5f4f2' },
  { id: 'linkedin', name: 'LinkedIn', iconClass: 'i-ph:linkedin-logo-fill', iconColor: '#0A66C2', bgColor: '#EBF5FB' },
  { id: 'facebook', name: 'Facebook', iconClass: 'i-ph:facebook-logo-fill', iconColor: '#1877F2', bgColor: '#EBF5FB' },
  { id: 'instagram', name: 'Instagram', iconClass: 'i-ph:instagram-logo-fill', iconColor: '#E1306C', bgColor: '#FDF0F5' },
];

function SocialIntegrationsPanel() {
  const [accounts, setAccounts] = useSocialState<any[]>([]);
  const [enabled, setEnabled] = useSocialState<Record<string, boolean>>({});
  const [template, setTemplate] = useSocialState('🚀 New release v{{version}} is live! Check out the latest features.');
  const [mediaAssets, setMediaAssets] = useSocialState('Attach auto-generated OG Image');

  // Modal states
  const [activePlatformModal, setActivePlatformModal] = useSocialState<string | null>(null);
  const [accountNameInput, setAccountNameInput] = useSocialState('');
  const [field1, setField1] = useSocialState('');
  const [field2, setField2] = useSocialState('');
  const [field3, setField3] = useSocialState('');
  const [field4, setField4] = useSocialState('');
  const [isSaving, setIsSaving] = useSocialState(false);

  const fetchAccounts = () => {
    fetch('/api/social')
      .then(r => r.json())
      .then((d: any) => {
        const accts = d.accounts || [];
        setAccounts(accts);
        const initEnabled: Record<string, boolean> = {};
        accts.forEach((a: any) => { if (a.is_active) initEnabled[a.platform] = true; });
        setEnabled(initEnabled);
      })
      .catch(() => {});
  };

  useSocialEffect(() => {
    fetchAccounts();
  }, []);

  const connectedPlatforms = accounts.filter((a: any) => a.is_active).map((a: any) => a.platform);

  const getAccountName = (platformId: string) => {
    const a = accounts.find((ac: any) => ac.platform === platformId);
    return a?.account_name || null;
  };

  const togglePlatform = (id: string) => {
    setEnabled(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const openConnectModal = (platformId: string) => {
    const existing = accounts.find((ac: any) => ac.platform === platformId);
    setAccountNameInput(existing?.account_name || '');
    setField1('');
    setField2('');
    setField3('');
    setField4('');
    setActivePlatformModal(platformId);
  };

  const handleSaveCredentials = async () => {
    if (!activePlatformModal || !accountNameInput) return;
    setIsSaving(true);

    let credentials: any = {};
    if (activePlatformModal === 'twitter') {
      credentials = { apiKey: field1, apiSecret: field2, accessToken: field3, accessTokenSecret: field4 };
    } else if (activePlatformModal === 'linkedin') {
      credentials = { accessToken: field1, organizationId: field2 || undefined };
    } else if (activePlatformModal === 'facebook') {
      credentials = { pageId: field1, pageAccessToken: field2 };
    } else if (activePlatformModal === 'instagram') {
      credentials = { businessAccountId: field1, accessToken: field2 };
    }

    try {
      await fetch('/api/social', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_account',
          platform: activePlatformModal,
          accountName: accountNameInput,
          credentials,
        }),
      });
      fetchAccounts();
      setActivePlatformModal(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <h1 className="text-[26px] font-semibold text-[#1f1b17] tracking-tight">Social Integrations</h1>
        <p className="text-[14px] text-[#5f5e5e] mt-1.5 max-w-lg leading-relaxed">
          Configure automated announcements and release notes across your social platforms upon successful deployment.
        </p>
      </div>

      <div className="px-8 pb-8 flex flex-col gap-7">
        {/* Global Settings */}
        <section>
          <p className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-widest mb-3">GLOBAL SETTINGS</p>
          <div className="border border-[#e8e4df] rounded-xl overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#e8e4df]">
              {/* Default Release Template */}
              <div className="p-5 flex flex-col gap-2">
                <p className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-widest">DEFAULT RELEASE TEMPLATE</p>
                <input
                  value={template}
                  onChange={e => setTemplate(e.target.value)}
                  className="w-full text-[13px] text-[#1f1b17] bg-transparent border-none outline-none placeholder-[#9d9893] mt-1"
                  placeholder="🚀 New release v{{version}} is live!"
                />
              </div>
              {/* Media Assets */}
              <div className="p-5 flex flex-col gap-2">
                <p className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-widest">MEDIA ASSETS</p>
                <select
                  value={mediaAssets}
                  onChange={e => setMediaAssets(e.target.value)}
                  className="w-full text-[13px] text-[#1f1b17] bg-transparent border-none outline-none mt-1 cursor-pointer"
                >
                  <option>Attach auto-generated OG Image</option>
                  <option>No image</option>
                  <option>Upload custom image</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Platform Connections */}
        <section>
          <p className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-widest mb-3">PLATFORM CONNECTIONS</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {SOCIAL_PLATFORMS.map(p => {
              const isConnected = connectedPlatforms.includes(p.id);
              const isEnabled = !!enabled[p.id];
              const accountName = getAccountName(p.id);

              return (
                <div
                  key={p.id}
                  className="border border-[#e8e4df] rounded-xl p-5 flex flex-col gap-3 bg-[#ffffff]"
                >
                  {/* Top row: icon + name + badge + toggle */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: p.bgColor }}
                      >
                        <div className={`${p.iconClass} text-xl`} style={{ color: p.iconColor }} />
                      </div>
                      <div>
                        <p className="font-semibold text-[#1f1b17] text-[14px]">{p.name}</p>
                        {isConnected ? (
                          <span className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold px-1.5 py-0.5 bg-[#d4edda] text-[#155724] rounded-full uppercase tracking-wider">
                            Connected
                          </span>
                        ) : (
                          <span className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold px-1.5 py-0.5 bg-[#e8e4df] text-[#9d9893] rounded-full uppercase tracking-wider">
                            Disconnected
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Toggle switch */}
                    <button
                      onClick={() => isConnected && togglePlatform(p.id)}
                      disabled={!isConnected}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        isConnected && isEnabled ? 'bg-[#a93011]' : 'bg-[#e8e4df]'
                      } ${!isConnected ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                        isConnected && isEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Bottom: account name or connect prompt */}
                  <div className="border-t border-[#e8e4df] pt-3 flex items-center justify-between">
                    {isConnected && accountName ? (
                      <div className="flex flex-col gap-0.5">
                        <p className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold text-[#9d9893] uppercase tracking-widest">
                          {p.id === 'linkedin' ? 'ACTIVE PAGE' : 'ACTIVE ACCOUNT'}
                        </p>
                        <p className="text-[13px] font-semibold text-[#1f1b17]">{accountName}</p>
                      </div>
                    ) : null}

                    <button
                      onClick={() => openConnectModal(p.id)}
                      className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold uppercase tracking-widest text-[#a93011] hover:underline"
                    >
                      {isConnected ? 'EDIT CREDENTIALS' : 'CONNECT ACCOUNT'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#e8e4df]">
          <button className="px-5 py-2 rounded-lg text-[13px] font-semibold text-[#5f5e5e] hover:text-[#1f1b17] transition-colors">
            Cancel
          </button>
          <button className="px-5 py-2 rounded-lg bg-[#a93011] text-white text-[13px] font-semibold hover:bg-[#ad3313] transition-colors flex items-center gap-2 shadow-sm">
            <div className="i-ph:rocket-launch text-[16px]" />
            Deploy
          </button>
        </div>
      </div>

      {/* Connect Credentials Modal */}
      {activePlatformModal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="bg-[#ffffff] border border-[#e8e4df] rounded-2xl p-6 w-full max-w-md shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-[#e8e4df] pb-3">
              <h3 className="font-semibold text-[16px] text-[#1f1b17] capitalize">
                Connect {SOCIAL_PLATFORMS.find(p => p.id === activePlatformModal)?.name}
              </h3>
              <button
                onClick={() => setActivePlatformModal(null)}
                className="text-[#9d9893] hover:text-[#1f1b17] text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">
                  Account Name / Label
                </label>
                <input
                  value={accountNameInput}
                  onChange={e => setAccountNameInput(e.target.value)}
                  placeholder="e.g. Official Company Account"
                  className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none focus:border-[#a93011]"
                />
              </div>

              {activePlatformModal === 'twitter' && (
                <>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">API Key</label>
                    <input type="password" value={field1} onChange={e => setField1(e.target.value)} placeholder="API Key" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">API Secret</label>
                    <input type="password" value={field2} onChange={e => setField2(e.target.value)} placeholder="API Secret" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Access Token</label>
                    <input type="password" value={field3} onChange={e => setField3(e.target.value)} placeholder="Access Token" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Access Token Secret</label>
                    <input type="password" value={field4} onChange={e => setField4(e.target.value)} placeholder="Access Token Secret" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                </>
              )}

              {activePlatformModal === 'linkedin' && (
                <>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Access Token</label>
                    <input type="password" value={field1} onChange={e => setField1(e.target.value)} placeholder="LinkedIn OAuth Access Token" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Organization ID (Optional)</label>
                    <input value={field2} onChange={e => setField2(e.target.value)} placeholder="e.g. 12345678" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                </>
              )}

              {activePlatformModal === 'facebook' && (
                <>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Page ID</label>
                    <input value={field1} onChange={e => setField1(e.target.value)} placeholder="Facebook Page ID" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Page Access Token</label>
                    <input type="password" value={field2} onChange={e => setField2(e.target.value)} placeholder="Page Access Token" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                </>
              )}

              {activePlatformModal === 'instagram' && (
                <>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Business Account ID</label>
                    <input value={field1} onChange={e => setField1(e.target.value)} placeholder="Instagram Business Account ID" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <label className="font-[#JetBrains_Mono,monospace] text-[10px] font-semibold text-[#9d9893] uppercase tracking-wider block mb-1">Access Token</label>
                    <input type="password" value={field2} onChange={e => setField2(e.target.value)} placeholder="Graph API Access Token" className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-lg px-3 py-2 text-[13px] outline-none" />
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#e8e4df]">
              <button
                onClick={() => setActivePlatformModal(null)}
                className="px-4 py-2 text-[13px] font-semibold text-[#5f5e5e] hover:text-[#1f1b17]"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCredentials}
                disabled={isSaving || !accountNameInput}
                className="px-4 py-2 bg-[#a93011] text-white rounded-lg text-[13px] font-semibold hover:bg-[#ad3313] disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : 'Save Credentials'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}