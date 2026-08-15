import { atom } from 'nanostores';
export const sidebarOpen = atom(false);

/**
 * Increment this atom after every successful chat save.
 * The sidebar subscribes to it and re-fetches the project list.
 */
export const chatSaved = atom(0);

/**
 * The most recently saved chat. Used for optimistic sidebar updates so the
 * entry appears instantly without waiting for a DB roundtrip.
 */
export const lastSaved = atom<{ chat_id: string; title: string } | null>(null);