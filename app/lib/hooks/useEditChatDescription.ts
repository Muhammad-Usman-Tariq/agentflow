import { useCallback, useEffect, useState } from 'react';
import { description as descriptionAtom, chatId } from '~/lib/persistence/useChatHistory';

interface EditChatDescriptionOptions {
  initialDescription?: string;
  customChatId?: string;
  syncWithGlobalStore?: boolean;
}

export function useEditChatDescription({
  initialDescription = '',
  customChatId,
  syncWithGlobalStore = false,
}: EditChatDescriptionOptions) {
  const [editing, setEditing] = useState(false);
  const [tempDescription, setTempDescription] = useState(initialDescription);
  const [currentDescription, setCurrentDescription] = useState(initialDescription);

  useEffect(() => {
    setCurrentDescription(initialDescription);
    setTempDescription(initialDescription);
  }, [initialDescription]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setTempDescription(e.target.value);
  }, []);

  const handleSubmit = useCallback(async () => {
    const id = customChatId || chatId.get();
    if (!id) return;

    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          title: tempDescription,
          messages: [],
          files: {},
        }),
      });

      setCurrentDescription(tempDescription);

      if (syncWithGlobalStore) {
        descriptionAtom.set(tempDescription);
      }
    } catch (error) {
      console.error('Failed to update title:', error);
    }

    setEditing(false);
  }, [tempDescription, customChatId, syncWithGlobalStore]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') handleSubmit();
      if (e.key === 'Escape') {
        setTempDescription(currentDescription);
        setEditing(false);
      }
    },
    [handleSubmit, currentDescription],
  );

  return {
    editing,
    handleChange,
    handleSubmit,
    handleKeyDown,
    currentDescription,
    tempDescription,
    setEditing,
  };
}