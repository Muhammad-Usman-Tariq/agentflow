import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useLocation } from '@remix-run/react';
import { toast } from 'react-toastify';
import { classNames } from '~/utils/classNames';
import { useStore } from '@nanostores/react';
import { sidebarOpen, chatSaved, lastSaved } from '~/lib/stores/sidebar';
import { DeployHub } from '~/components/deploy/DeployHub';

interface Chat {
  id: number;
  chat_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export function Menu() {
  const isOpen = useStore(sidebarOpen);
  const savedCount = useStore(chatSaved);
  const newSave = useStore(lastSaved);
  const navigate = useNavigate();
  const location = useLocation();
  const isGuest = location.pathname === '/guest';
  const [list, setList] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showConnectors, setShowConnectors] = useState(false);
  const [loading, setLoading] = useState(false);

  // ── Full fetch from DB ──────────────────────────────────────────────────────
  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[SIDEBAR] Fetching /api/projects...');
      const response = await fetch('/api/projects', { credentials: 'same-origin' });
      const data = await response.json() as { projects: Chat[] };
      console.log('[SIDEBAR] Got', data.projects?.length ?? 0, 'projects');
      setList(data.projects || []);
    } catch (error) {
      console.error('[SIDEBAR] Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Re-fetch when route changes or DB save is confirmed
  useEffect(() => {
    loadEntries();
  }, [loadEntries, location.pathname, savedCount]);

  // Optimistic update: insert new chat immediately when lastSaved changes
  useEffect(() => {
    if (!newSave) return;
    console.log('[SIDEBAR] Optimistic insert:', newSave.chat_id, newSave.title);
    setList((prev) => {
      // Remove if already exists (avoid duplicates), then prepend
      const filtered = prev.filter((c) => c.chat_id !== newSave.chat_id);
      const optimistic: Chat = {
        id: 0,
        chat_id: newSave.chat_id,
        title: newSave.title,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return [optimistic, ...filtered];
    });
  }, [newSave]);

  const filteredList = list.filter((chat) =>
    chat.title?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const deleteChat = useCallback(async (id: string) => {
    try {
      const response = await fetch(`/api/projects?id=${id}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (response.ok) {
        setList(prev =>
          prev.filter(
            chat => String(chat.id) !== String(id) && String(chat.chat_id) !== String(id)
          )
        );
        toast.success('Chat deleted');
      }
    } catch (error) {
      toast.error('Failed to delete chat');
    }
  }, []);

  return (
    <>
      {/* Click-outside overlay to close sidebar */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[15] bg-transparent"
          onClick={() => sidebarOpen.set(false)}
        />
      )}

      <nav
        className={classNames(
          'fixed left-0 top-0 h-full w-[260px] bg-[#fff8f4] border-r border-[#e8e4df] flex flex-col p-4 gap-3 z-[16] transition-transform duration-200 shadow-sm',
          { '-translate-x-full': !isOpen }
        )}
      >
        {/* Logo Header */}
        <div className="flex items-center gap-3 mb-2 shrink-0 pt-1">
          <div className="w-8 h-8 rounded-lg bg-[#cb4927] text-white flex items-center justify-center font-bold text-sm shadow-sm">
            D
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-[18px] text-[#a93011] leading-none tracking-tight">
              DigitalSofts
            </h1>
            <p className="font-[#JetBrains_Mono,monospace] text-[11px] text-[#9d9893] mt-0.5">
              AI Development
            </p>
          </div>
          {/* Close sidebar button */}
          <button
            onClick={() => sidebarOpen.set(false)}
            className="p-1.5 rounded-lg text-[#9d9893] hover:text-[#a93011] hover:bg-[#f5ece6] transition-colors flex items-center justify-center shrink-0"
            title="Close sidebar"
          >
            <div className="i-ph:x text-lg" />
          </button>
        </div>

        {/* Primary Action */}
        <button
          onClick={() => {
            window.location.href = isGuest ? '/guest' : '/';
          }}
          className="bg-[#1a1a1a] text-white font-medium text-[13px] px-4 py-2 rounded-lg hover:bg-black/90 transition-all flex items-center justify-center gap-2 w-full shrink-0 shadow-sm active:scale-[0.98]"
        >
          <div className="i-ph:plus text-[16px]" />
          Start new chat
        </button>

        {/* Connectors Action */}
        <button
          onClick={() => setShowConnectors(true)}
          className="bg-[#ffffff] border border-[#a93011] text-[#a93011] font-medium text-[13px] px-4 py-2 rounded-lg hover:bg-[#ffdad2]/30 transition-all flex items-center justify-center gap-2 w-full shrink-0 shadow-sm active:scale-[0.98]"
        >
          <div className="i-ph:plugs-connected text-[16px]" />
          Connectors
        </button>

        {/* Search */}
        <div className="relative mt-2 shrink-0">
          <div className="i-ph:magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-[#9d9893] text-[16px]" />
          <input
            type="text"
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f5f4f2] border border-[#e8e4df] rounded-md py-2 pl-9 pr-3 text-[13px] focus:outline-none focus:border-[#a93011] transition-colors text-[#1f1b17] placeholder-[#9d9893]"
          />
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto mt-2 pr-1 space-y-1">
          <div className="flex items-center justify-between mb-2 pl-2 pr-1">
            <p className="font-[#JetBrains_Mono,monospace] text-[11px] font-semibold text-[#9d9893] uppercase tracking-wider">
              RECENT CHATS
            </p>
            <button
              onClick={loadEntries}
              className="text-[#9d9893] hover:text-[#a93011] transition-colors"
              title="Refresh chat list"
            >
              <div className={classNames('i-ph:arrows-clockwise text-[14px]', { 'animate-spin': loading })} />
            </button>
          </div>

          {filteredList.length === 0 ? (
            <div className="text-center text-[#9d9893] py-6 text-[13px]">
              {loading ? 'Loading...' : 'No projects yet'}
            </div>
          ) : (
            filteredList.map((chat) => (
              <div
                key={chat.chat_id || chat.id}
                onClick={() => {
                  navigate(`/chat/${chat.chat_id || chat.id}`);
                  sidebarOpen.set(false);
                }}
                className="group flex items-center gap-2.5 text-[#59413b] hover:text-[#a93011] hover:bg-[#f0e6e0] px-3 py-2 rounded-lg transition-colors cursor-pointer relative"
              >
                <div className="i-ph:chat-circle text-[18px] text-[#9d9893] group-hover:text-[#a93011]" />
                <span className="text-[13px] font-medium truncate flex-1">
                  {chat.title || 'Untitled Project'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(String(chat.chat_id || chat.id));
                  }}
                  className="opacity-0 group-hover:opacity-100 absolute right-2 text-[#9d9893] hover:text-[#ba1a1a] transition-opacity p-1"
                >
                  <div className="i-ph:trash text-[16px]" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer Actions */}
        <div className="mt-auto pt-3 border-t border-[#e8e4df] shrink-0 space-y-1">
          <a
            href="#"
            className="flex items-center gap-3 text-[#59413b] hover:text-[#a93011] hover:bg-[#f0e6e0] px-3 py-2 rounded-lg transition-colors text-[13px] font-medium"
          >
            <div className="i-ph:gear text-[18px]" />
            <span>Settings</span>
          </a>
          <a
            href="#"
            className="flex items-center gap-3 text-[#59413b] hover:text-[#a93011] hover:bg-[#f0e6e0] px-3 py-2 rounded-lg transition-colors text-[13px] font-medium"
          >
            <div className="i-ph:question text-[18px]" />
            <span>Help</span>
          </a>
        </div>
      </nav>

      {/* Connectors Modal */}
      {showConnectors && (
        <DeployHub onClose={() => setShowConnectors(false)} />
      )}
    </>
  );
}