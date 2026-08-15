import { useLoaderData, useNavigate, useParams } from '@remix-run/react';
import { useState, useEffect } from 'react';
import { atom } from 'nanostores';
import { type Message } from 'ai';
import { workbenchStore } from '~/lib/stores/workbench';
import { webcontainer } from '~/lib/webcontainer';
import { chatStore } from '~/lib/stores/chat';
import { chatSaved } from '~/lib/stores/sidebar';
export const chatId = atom<string | undefined>(undefined);
export const description = atom<string | undefined>(undefined);

async function saveToDatabase(id: string, title: string, messages: Message[], files: any) {
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, title, messages, files }),
    });
    if (res.ok) {
      // Signal the sidebar to re-fetch the chat list
      chatSaved.set(chatSaved.get() + 1);
    }
  } catch (error) {
    console.error('Failed to save to database:', error);
  }
}

async function loadFromDatabase(id: string) {
  try {
    const response = await fetch(`/api/projects?id=${id}`);
    const data = await response.json() as { project: any };
    return data.project || null;
  } catch (error) {
    console.error('Failed to load from database:', error);
    return null;
  }
}

export function useChatHistory() {
  const navigate = useNavigate();
  const params = useParams();
  const loaderData = useLoaderData<{ id?: string }>();
  const mixedId = params.id || loaderData?.id;
 



  const [initialMessages, setInitialMessages] = useState<Message[]>([]);
  const [ready, setReady] = useState<boolean>(false);
  useEffect(() => {
     
    if (!mixedId) {
      setReady(true);
      return;
    }

    (async () => {
      // ✅ Reset everything before loading new chat
      setReady(false);
      setInitialMessages([]);
      workbenchStore.files.set({});
      workbenchStore.showWorkbench.set(false);
      description.set(undefined);
      chatId.set(undefined);

      // Clear WebContainer files
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
      console.log('🔍 RAW project:', JSON.stringify(project).substring(0, 300));
      console.log('🔍 Project:', project?.title, '| Files:', project?.files ? Object.keys(project.files).length : 0);
      console.log('🔍 Project loaded:', project?.title);
      console.log('🔍 Project files:', project?.files);
      console.log('🔍 Files type:', typeof project?.files);

      if (!project) {
        navigate('/', { replace: true });
        setReady(true);
        return;
      }

      const messages = (typeof project.messages === 'string' ? JSON.parse(project.messages) : project.messages) as Message[];
      const files = typeof project.files === 'string' ? JSON.parse(project.files) : project.files;

      setInitialMessages(messages);
      description.set(project.title);
      chatId.set(mixedId);
      console.log('🔍 Files check:', files, typeof files, files ? Object.keys(files).length : 'null');
      if (files && Object.keys(files).length > 0) {
          console.log('🔍 Files from DB:', Object.keys(files));
           console.log('🔍 Files count:', Object.keys(files).length);
        try {
          const container = await webcontainer;
          const fileMap: Record<string, any> = {};
          for (const [rawPath, fileData] of Object.entries(files as Record<string, any>)) {
            if (fileData?.type !== 'file') continue;

            let storePath = rawPath
            .replace('/home/project/', '')  // hardcode workdir
            .replace(/^\/+/, '');

            const content = fileData.content ?? '';

            fileMap[storePath] = {
              type: 'file' as const,
              content,
              isBinary: false,
            };

            const fsPath = '/' + storePath;
            try {
              const dir = fsPath.substring(0, fsPath.lastIndexOf('/'));
              if (dir && dir !== '/') {
                await container.fs.mkdir(dir, { recursive: true });
              }
              await container.fs.writeFile(fsPath, content, { encoding: 'utf8' });
            } catch (e) {
              console.error('Failed to write:', fsPath, e);
            }
          }

          // Inject into workbench store
          for (const [path, dirent] of Object.entries(fileMap)) {
            workbenchStore.files.setKey(path, dirent);
          }
          workbenchStore.setDocuments(fileMap);
          workbenchStore.showWorkbench.set(true);
          console.log('🔍 Workbench set TRUE, fileMap:', Object.keys(fileMap));
          chatStore.setKey('started', true);
          console.log('✅ Files loaded:', Object.keys(fileMap).length);

          // Start dev server
          try {
            const hasPackageJson = fileMap['package.json'] !== undefined;
            if (hasPackageJson) {
              const installProc = await container.spawn('npm', ['install']);
              await installProc.exit;
              const devProc = await container.spawn('npm', ['run', 'dev']);
              devProc.output.pipeTo(
                new WritableStream({ write(data) { console.log('[dev]', data); } })
              );
            } else {
              const serveProc = await container.spawn('npx', ['-y', 'serve', '.', '--listen', '3000']);
              serveProc.output.pipeTo(
                new WritableStream({ write(data) { console.log('[serve]', data); } })
              );
            }
          } catch (e) {
            console.error('Failed to start dev server:', e);
          }

        } catch (e) {
          console.error('WebContainer error:', e);
        }
      }

      setReady(true);
    })();
  }, [mixedId]);

  return {
    ready: !mixedId || ready,
    initialMessages,
    storeMessageHistory: async (messages: Message[]) => {
      if (messages.length === 0) return;

      messages = messages.filter((m) => !m.annotations?.includes('no-store'));

      const { firstArtifact } = workbenchStore;

      if (!description.get() && firstArtifact?.title) {
        description.set(firstArtifact.title);
      }

      // Fallback: derive a short title from the first user message
      if (!description.get()) {
        const firstUserMsg = messages.find((m) => m.role === 'user');
        if (firstUserMsg) {
          const text = typeof firstUserMsg.content === 'string'
            ? firstUserMsg.content
            : Array.isArray(firstUserMsg.content)
              ? (firstUserMsg.content as any[]).filter((p: any) => p.type === 'text').map((p: any) => p.text).join(' ')
              : '';
          if (text.trim()) {
            description.set(text.trim().slice(0, 60) + (text.trim().length > 60 ? '…' : ''));
          }
        }
      }

      if (!chatId.get()) {
        const newId = String(Date.now());
        chatId.set(newId);
        const url = new URL(window.location.href);
        url.pathname = `/chat/${newId}`;
        window.history.replaceState({}, '', url);
      }

      const finalChatId = chatId.get();
      if (!finalChatId) return;

      await saveToDatabase(
        finalChatId,
        description.get() || 'Untitled Project',
        messages,
        workbenchStore.files.get()
      );
    },
    updateChatMestaData: async () => {},
    duplicateCurrentChat: async () => {},
    importChat: async () => {},
    exportChat: async () => {},
  };
}