import { atom } from 'nanostores';
export const sidebarOpen = atom(false);

/**
 * Increment this atom after every successful chat save.
 * The sidebar subscribes to it and re-fetches the project list.
 */
export const chatSaved = atom(0);