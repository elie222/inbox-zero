import { atom } from "jotai";

/**
 * Open state for the command palette. It lives outside CommandK so surfaces
 * elsewhere — the combined inbox's toolbar search button, for one — can open
 * it without faking a ⌘K keystroke.
 */
export const commandPaletteOpenAtom = atom(false);

export type MailCommandContext = {
  actions: {
    archive: () => void;
    markRead?: () => void;
    markUnread?: () => void;
    snooze?: (until: Date) => void;
    trash?: () => void;
  };
  hasRead: boolean;
  hasUnread: boolean;
  targetCount: number;
};

/**
 * The active mail list owns its selection state and actions. This bridge lets
 * the app-wide palette consume them without duplicating that state.
 */
export const mailCommandContextAtom = atom<MailCommandContext | null>(null);
