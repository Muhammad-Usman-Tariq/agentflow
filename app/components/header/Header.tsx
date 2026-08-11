import { useStore } from '@nanostores/react';
import { useState } from 'react';
import { ClientOnly } from 'remix-utils/client-only';
import { chatStore } from '~/lib/stores/chat';
import { classNames } from '~/utils/classNames';
import { HeaderActionButtons } from './HeaderActionButtons.client';
import { ChatDescription } from '~/lib/persistence/ChatDescription.client';
import { sidebarOpen } from '~/lib/stores/sidebar';
import { workbenchStore } from '~/lib/stores/workbench';

export function Header() {
  const chat = useStore(chatStore);
  const isOpen = useStore(sidebarOpen);
  const showWorkbench = useStore(workbenchStore.showWorkbench);
  const currentView = useStore(workbenchStore.currentView);
  const [showProfile, setShowProfile] = useState(false);
  const [showNotify, setShowNotify] = useState(false);

  return (
    <header
      className={classNames(
        'bg-[#fff8f4] text-[#1f1b17] border-b border-[#e8e4df] flex justify-between items-center w-full h-16 px-6 shrink-0 z-10',
        {
          'border-transparent': !chat.started,
          'border-[#e8e4df]': chat.started,
        }
      )}
    >
      {/* Left: Sidebar Toggle + Breadcrumb / Brand */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => sidebarOpen.set(!isOpen)}
          className="p-1.5 rounded-lg text-[#5f5e5e] hover:text-[#a93011] hover:bg-[#f5ece6] transition-colors flex items-center justify-center"
          title="Toggle Sidebar"
        >
          <div className="i-ph:sidebar-simple-duotone text-xl" />
        </button>

        <div className="flex items-center gap-2 text-[14px]">
          <span className="text-[#9d9893] hover:text-[#a93011] cursor-pointer transition-colors font-medium">
            Projects
          </span>
          <div className="i-ph:caret-right text-[12px] text-[#9d9893]" />
          <span className="text-[#1f1b17] font-semibold truncate max-w-[200px] sm:max-w-[300px]">
            {chat.started ? (
              <ClientOnly>{() => <ChatDescription />}</ClientOnly>
            ) : (
              'DigitalSofts AI'
            )}
          </span>
        </div>
      </div>

      {/* Center: Navigation Tabs */}
      <nav className="hidden md:flex gap-6 h-full items-end">
        <button
          onClick={() => {
            workbenchStore.showWorkbench.set(false);
          }}
          className="text-[#5f5e5e] hover:text-[#a93011] pb-3 flex items-center gap-1.5 transition-all text-[12px] font-[#JetBrains_Mono,monospace] uppercase tracking-wider font-semibold"
        >
          <div className="i-ph:squares-four text-[16px]" />
          <span>Overview</span>
        </button>
        <button
          onClick={() => {
            if (showWorkbench && currentView === 'code') {
              workbenchStore.showWorkbench.set(false);
            } else {
              workbenchStore.showWorkbench.set(true);
              workbenchStore.currentView.set('code');
            }
          }}
          className={classNames(
            'pb-3 flex items-center gap-1.5 transition-all text-[12px] font-[#JetBrains_Mono,monospace] uppercase tracking-wider font-semibold',
            showWorkbench && currentView === 'code'
              ? 'text-[#a93011] font-bold border-b-2 border-[#a93011]'
              : 'text-[#5f5e5e] hover:text-[#a93011]'
          )}
        >
          <div className="i-ph:robot text-[16px]" />
          <span>Agent</span>
        </button>
        <button
          onClick={() => {
            workbenchStore.showWorkbench.set(true);
            workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
          }}
          className="text-[#5f5e5e] hover:text-[#a93011] pb-3 flex items-center gap-1.5 transition-all text-[12px] font-[#JetBrains_Mono,monospace] uppercase tracking-wider font-semibold"
        >
          <div className="i-ph:terminal text-[16px]" />
          <span>Terminal</span>
        </button>
        <button
          onClick={() => {
            if (showWorkbench && currentView === 'preview') {
              workbenchStore.showWorkbench.set(false);
            } else {
              workbenchStore.showWorkbench.set(true);
              workbenchStore.currentView.set('preview');
            }
          }}
          className={classNames(
            'pb-3 flex items-center gap-1.5 transition-all text-[12px] font-[#JetBrains_Mono,monospace] uppercase tracking-wider font-semibold',
            showWorkbench && currentView === 'preview'
              ? 'text-[#a93011] font-bold border-b-2 border-[#a93011]'
              : 'text-[#5f5e5e] hover:text-[#a93011]'
          )}
        >
          <div className="i-ph:eye text-[16px]" />
          <span>Preview</span>
        </button>
      </nav>

      {/* Right: Actions */}
      <div className="flex items-center gap-3 relative">
        {chat.started && (
          <ClientOnly>
            {() => <HeaderActionButtons chatStarted={chat.started} />}
          </ClientOnly>
        )}
        <div className="hidden sm:block w-px h-5 bg-[#e8e4df] mx-1" />

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => { setShowNotify(!showNotify); setShowProfile(false); }}
            className="text-[#9d9893] hover:text-[#a93011] transition-colors p-1.5 rounded-lg hover:bg-[#f5ece6] relative"
            title="Notifications"
          >
            <div className="i-ph:bell text-lg" />
            {/* Badge dot */}
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#a93011] border-2 border-[#fff8f4]" />
          </button>

          {showNotify && (
            <>
              <div className="fixed inset-0 z-[40]" onClick={() => setShowNotify(false)} />
              <div className="absolute right-0 top-10 z-[41] w-72 bg-[#ffffff] border border-[#e8e4df] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e8e4df] bg-[#f5f4f2] flex items-center justify-between">
                  <span className="font-semibold text-[#1f1b17] text-[13px]">Notifications</span>
                  <span className="font-[#JetBrains_Mono,monospace] text-[9px] font-semibold px-2 py-0.5 bg-[#a93011] text-white rounded-full">1 NEW</span>
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <div className="flex items-start gap-3 p-3 bg-[#fff8f4] rounded-lg border border-[#e8e4df]">
                    <div className="i-ph:sparkle-fill text-[#a93011] text-lg shrink-0 mt-0.5" />
                    <div>
                      <p className="text-[13px] font-semibold text-[#1f1b17]">DigitalSofts AI is ready</p>
                      <p className="text-[12px] text-[#5f5e5e] mt-0.5">Start building your next project with AI assistance.</p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Profile Button */}
        <div className="relative">
          <button
            onClick={() => { setShowProfile(!showProfile); setShowNotify(false); }}
            className="text-[#9d9893] hover:text-[#a93011] transition-colors p-1.5 rounded-lg hover:bg-[#f5ece6] flex items-center gap-1.5"
            title="Profile"
          >
            <div className="i-ph:user-circle text-xl" />
          </button>

          {showProfile && (
            <>
              <div className="fixed inset-0 z-[40]" onClick={() => setShowProfile(false)} />
              <div className="absolute right-0 top-10 z-[41] w-52 bg-[#ffffff] border border-[#e8e4df] rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#e8e4df] bg-[#f5f4f2]">
                  <p className="font-semibold text-[#1f1b17] text-[13px]">My Account</p>
                  <p className="text-[11px] text-[#9d9893] mt-0.5">DigitalSofts AI</p>
                </div>
                <div className="p-2 flex flex-col gap-0.5">
                  <a
                    href="/auth/login"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#5f5e5e] hover:text-[#1f1b17] hover:bg-[#f5f4f2] transition-colors font-medium"
                  >
                    <div className="i-ph:user text-[16px]" />
                    Profile Settings
                  </a>
                  <div className="border-t border-[#e8e4df] my-1" />
                  <a
                    href="/auth/logout"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-[#ba1a1a] hover:bg-[#ffdad6]/50 transition-colors font-medium"
                  >
                    <div className="i-ph:sign-out text-[16px]" />
                    Sign Out
                  </a>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
