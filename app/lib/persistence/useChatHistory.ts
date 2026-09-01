import { useLoaderData, useNavigate, useParams } from '@remix-run/react';
import { useState, useEffect, useRef } from 'react';
import { atom } from 'nanostores';
import { type Message } from 'ai';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { chatStore } from '~/lib/stores/chat';
import { chatSaved, lastSaved } from '~/lib/stores/sidebar';

export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

// ── WebContainer File Scanner ──────────────────────────────────────────────────

async function readWebContainerFiles(): Promise<Record<string, { type: 'file'; content: string; isBinary: boolean }>> {
  const result: Record<string, { type: 'file'; content: string; isBinary: boolean }> = {};
  try {
    const container = await webcontainer;
    async function scanDir(dirPath: string) {
      const entries = await container.fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === 'dist' ||
          entry.name === 'build' ||
          entry.name.startsWith('.')
        ) {
          continue;
        }
        const fullPath = dirPath === '/' ? '/' + entry.name : dirPath + '/' + entry.name;
        if (entry.isDirectory()) {
          await scanDir(fullPath);
        } else if (entry.isFile()) {
          try {
            const content = await container.fs.readFile(fullPath, 'utf8');
            const cleanPath = fullPath.replace(/^\/+/, '');
            result[cleanPath] = { type: 'file', content, isBinary: false };
          } catch {}
        }
      }
    }
    await scanDir('/');
  } catch (err) {
    console.warn('[CHAT SAVE] Failed to scan WebContainer fs:', err);
  }
  return result;
}

// ── Fallback Message Parser for File Extraction ────────────────────────────────

function extractFilesFromMessages(messages: Message[]): Record<string, { type: 'file'; content: string; isBinary: boolean }> {
  const fileMap: Record<string, { type: 'file'; content: string; isBinary: boolean }> = {};
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const content = typeof message.content === 'string' ? message.content : '';
    if (!content.includes('<boltAction')) continue;

    const actionMatches = content.matchAll(
      /<boltAction[^>]*type="file"(?:[^>]*filePath="([^"]*)")?[^>]*>([\s\S]*?)<\/boltAction>/g
    );
    for (const match of actionMatches) {
      const [, filePath, fileContent] = match;
      if (filePath) {
        const storePath = filePath.replace('/home/project/', '').replace(/^\/+/, '');
        fileMap[storePath] = {
          type: 'file',
          content: fileContent.trim(),
          isBinary: false,
        };
      }
    }
  }
  return fileMap;
}

// ── Save ──────────────────────────────────────────────────────────────────────

async function saveToDatabase(id: string, title: string, messages: Message[], files: any) {
  try {
    console.log('[CHAT SAVE] id:', id, '| title:', title, '| msgs:', messages.length, '| files:', Object.keys(files || {}).length);

    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ id, title, messages, files }),
    });

    const raw = await res.text();
    console.log('[CHAT SAVE] status:', res.status, '| body:', raw.slice(0, 200));

    if (res.ok) {
      lastSaved.set({ chat_id: id, title });
      chatSaved.set(chatSaved.get() + 1);
      console.log('[CHAT SAVE] OK — chatSaved =', chatSaved.get());
    } else {
      console.error('[CHAT SAVE] Server error', res.status, raw.slice(0, 400));
    }
  } catch (err) {
    console.error('[CHAT SAVE] Network error:', err);
  }
}

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadFromDatabase(id: string) {
  try {
    const res = await fetch(`/api/projects?id=${encodeURIComponent(id)}`, {
      credentials: 'same-origin',
    });
    const data = (await res.json()) as { project: any };
    console.log('[CHAT LOAD] id:', id, '| found:', !!data.project, '| title:', data.project?.title);
    return data.project || null;
  } catch (err) {
    console.error('[CHAT LOAD] Error:', err);
    return null;
  }
}

// ── Title helper ──────────────────────────────────────────────────────────────

function deriveTitle(messages: Message[]): string | undefined {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return undefined;

  let text = '';
  if (typeof first.content === 'string') {
    text = first.content;
  } else if (Array.isArray(first.content)) {
    text = (first.content as any[])
      .filter((p: any) => p.type === 'text')
      .map((p: any) => p.text as string)
      .join(' ');
  }

  text = text.trim();
  if (!text) return undefined;
  return text.length > 60 ? text.slice(0, 60) + '...' : text;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useChatHistory() {
  const navigate = useNavigate();
  const params = useParams();
  const loaderData = useLoaderData<{ id?: string }>();
  const mixedId = params.id || loaderData?.id;

  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  // Bug 3 fix: latch that flips to true the moment we confirm this chat has
  // real files in the DB. storeMessageHistory checks this synchronously before
  // considering an empty-map overwrite, eliminating the race between the
  // throttled save trigger and the async WebContainer restore completing.
  const hadFilesRef = useRef<boolean>(false);

  useEffect(() => {
    if (!mixedId) {
      setReady(true);
      return;
    }

    (async () => {
      setReady(false);
      setInitialMessages([]);
      workbenchStore.files.set({});
      workbenchStore.showWorkbench.set(false);
      description.set(undefined);
      chatId.set(undefined);

      // Clear WebContainer filesystem except node_modules
      try {
        const container = await webcontainer;
        const entries = await container.fs.readdir('/', { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name !== 'node_modules') {
            try {
              await container.fs.rm('/' + entry.name, { recursive: true });
            } catch {}
          }
        }
      } catch {}

      const project = await loadFromDatabase(mixedId);

      if (!project) {
        console.warn('[CHAT LOAD] Not found — redirecting to /');
        navigate('/', { replace: true });
        setReady(true);
        return;
      }

      const messages = (
        typeof project.messages === 'string' ? JSON.parse(project.messages) : project.messages
      ) as Message[];

      let filesToRestore =
        typeof project.files === 'string' ? JSON.parse(project.files) : (project.files || {});

      // Fallback: if project.files is empty, extract files from generated messages
      if (!filesToRestore || Object.keys(filesToRestore).length === 0) {
        console.log('[CHAT LOAD] files column empty — extracting generated files from message history...');
        filesToRestore = extractFilesFromMessages(messages);
      }

      // ⚠️ FIX: a saved file-map sometimes ends up with a stray entry whose
      // path is actually a PARENT DIRECTORY of another real file (e.g.
      // "src/components": "" alongside "src/components/SharedLayout.tsx":
      // "..."). Restoring that stray entry writes a plain FILE at
      // /src/components, and the next mkdir('/src/components') for the
      // real SharedLayout.tsx then fails (can't mkdir where a file
      // already exists) — silently dropping the real file and leaving an
      // empty file where a folder should be. Drop any path that is a
      // prefix-of-another-path before restoring, since such an entry can
      // never legitimately be a real file.
      if (filesToRestore && typeof filesToRestore === 'object') {
        const allPaths = Object.keys(filesToRestore);
        const cleaned: Record<string, any> = {};
        for (const path of allPaths) {
          const isParentDirOfAnother = allPaths.some(
            (other) => other !== path && other.startsWith(path.replace(/\/$/, '') + '/')
          );
          if (isParentDirOfAnother) {
            console.warn('[CHAT LOAD] Dropping stray directory-as-file entry:', path);
            continue;
          }
          cleaned[path] = filesToRestore[path];
        }
        filesToRestore = cleaned;
      }

      setInitialMessages(messages);
      description.set(project.title);
      chatId.set(mixedId);

      // Restore files into WebContainer and Workbench Store
      if (filesToRestore && Object.keys(filesToRestore).length > 0) {
        // Bug 3: latch before any async work so storeMessageHistory can read it
        // synchronously even if the WebContainer write loop takes a while.
        hadFilesRef.current = true;
          workbenchStore.showWorkbench.set(true);
          chatStore.setKey('started', true);
        console.log('[CHAT LOAD] Restoring', Object.keys(filesToRestore).length, 'files');
        try {
          const container = await webcontainer;
          const fileMap: Record<string, any> = {};

          for (const [rawPath, fileData] of Object.entries(filesToRestore as Record<string, any>)) {
            const storePath = rawPath.replace('/home/project/', '').replace(/^\/+/, '');
            const content = typeof fileData === 'string' ? fileData : (fileData as any)?.content ?? '';

            fileMap[storePath] = { type: 'file' as const, content, isBinary: false };

            const fsPath = '/' + storePath;
            try {
              const dir = fsPath.substring(0, fsPath.lastIndexOf('/'));
              if (dir && dir !== '/') {
                await container.fs.mkdir(dir, { recursive: true });
              }
              await container.fs.writeFile(fsPath, content, { encoding: 'utf8' });
            } catch (e) {
              console.error('[CHAT LOAD] Write failed:', fsPath, e);
            }
          }

          for (const [pathKey, dirent] of Object.entries(fileMap)) {
            workbenchStore.files.setKey(pathKey, dirent);
          }
          workbenchStore.setDocuments(fileMap);
          workbenchStore.showWorkbench.set(true);
          chatStore.setKey('started', true);

          // Same fix as runAgent() — register this restored project as an artifact so
          // deploy (Netlify/Vercel/GitHub/GitLab) can find it via workbenchStore.firstArtifact.
          // Without this, only brand-new generations become deployable; every previously
          // generated project would still show "No active project found" on reopen.
          workbenchStore.addArtifact({
            messageId: mixedId,
            artifactId: mixedId,
            id: mixedId,
            title: description.get() || project.title || 'Restored Project',
            type: 'bundled',
          });

          // Select the first file to show in the code editor
          const firstFileKey = Object.keys(fileMap).find((k) => k.endsWith('.tsx') || k.endsWith('.jsx') || k.endsWith('.html') || k.endsWith('.js') || k.endsWith('.ts')) || Object.keys(fileMap)[0];
          if (firstFileKey) {
            workbenchStore.setSelectedFile(firstFileKey);
          }

          console.log('[CHAT LOAD] Files restored successfully:', Object.keys(fileMap).length);

          // Auto-start dev server if package.json exists
          try {
            if (fileMap['package.json']) {
              const inst = await container.spawn('npm', ['install']);
              await inst.exit;
              const dev = await container.spawn('npm', ['run', 'dev']);
              dev.output.pipeTo(
                new WritableStream({
                  write(d) {
                    console.log('[dev]', d);
                  },
                })
              );
            } else {
              const srv = await container.spawn('npx', ['-y', 'serve', '.', '--listen', '3000']);
              srv.output.pipeTo(
                new WritableStream({
                  write(d) {
                    console.log('[serve]', d);
                  },
                })
              );
            }
          } catch (e) {
            console.error('[CHAT LOAD] Dev server start error:', e);
          }
        } catch (e) {
          console.error('[CHAT LOAD] WebContainer error during restore:', e);
        }
      }

      setReady(true);
    })();
  }, [mixedId]);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: Message[], files?: Record<string, any>) => {
      if (messages.length === 0) return;

      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      const { firstArtifact } = workbenchStore;

      // Priority 1: artifact title
      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact.title);
      }

      // Priority 2: first user message text
      if (!description.get()) {
        const derived = deriveTitle(messages);
        if (derived) description.set(derived);
      }

      // Assign a stable ID for new chats
      if (!chatId.get()) {
        const newId = String(Date.now());
        chatId.set(newId);
        const url = new URL(window.location.href);
        url.pathname = `/chat/${newId}`;
        window.history.replaceState({}, '', url);
      }

      const finalChatId = chatId.get();
      if (!finalChatId) return;

      const title = description.get() || 'Untitled Project';

      // Capture all files from passed argument / workbench store AND WebContainer filesystem
      const storeFiles = files || workbenchStore.files.get() || {};
      const containerFiles = await readWebContainerFiles();
      const mergedFiles = { ...storeFiles, ...containerFiles };

      // Bug 3 fix: two-tier empty-map guard.
      // Tier 1 (fast, synchronous): if hadFilesRef is already latched we know
      //   this chat has real files — bail out immediately without any network call.
      // Tier 2 (async fallback): for the very first save after a cold page load
      //   (before the latch fires), fall back to the original DB round-trip so we
      //   still catch the race on brand-new sessions.
      if (Object.keys(mergedFiles).length === 0) {
        if (hadFilesRef.current) {
          console.warn(
            '[CHAT STORE] Skipping save — hadFilesRef latched: this chat has real files but the workbench file-map is currently empty (restore in progress or not yet reflected in store).'
          );
          return;
        }
        // Tier 2 fallback — only runs when hadFilesRef has not yet been set.
        const existing = await loadFromDatabase(finalChatId).catch(() => null);
        const existingFileCount = existing?.files
          ? Object.keys(typeof existing.files === 'string' ? JSON.parse(existing.files) : existing.files).length
          : 0;
        if (existingFileCount > 0) {
          // Latch now so future calls go through Tier 1.
          hadFilesRef.current = true;
          console.warn(
            '[CHAT STORE] Skipping save — would overwrite',
            existingFileCount,
            'existing file(s) with an empty file-map. This save was likely triggered before the workbench finished restoring.'
          );
          return;
        }
      }

      console.log('[CHAT STORE] Saving:', finalChatId, '| title:', title, '| files count:', Object.keys(mergedFiles).length);

      await saveToDatabase(finalChatId, title, messages, mergedFiles);

      // Bug 3 follow-up: latch immediately after any save that actually wrote
      // real files — including the very first save of a brand-new project.
      if (Object.keys(mergedFiles).length > 0) {
        hadFilesRef.current = true;
      }
    },
    updateChatMestaData: async () => {},
    duplicateCurrentChat: async () => {},
    importChat: async () => {},
    exportChat: async () => {},
  };
}