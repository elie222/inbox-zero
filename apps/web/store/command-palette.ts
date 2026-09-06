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
    forward?: () => void;
    label?: () => void;
    markRead?: () => void;
    markSpam?: () => void;
    markUnread?: () => void;
    move?: () => void;
    openExternal?: () => void;
    snooze?: (until: Date) => void;
    trash?: () => void;
  };
  hasRead: boolean;
  hasUnread: boolean;
  openExternalLabel?: string;
  target?: { emailAccountId: string; threadId: string };
  targetCount: number;
};

export type SenderCommandContext = {
  emailAccountId: string;
  isAutoArchived: boolean;
  isAutoArchiveDisabled: boolean;
  isUnsubscribeDisabled: boolean;
  threadId: string;
  toggleAutoArchive: () => void;
  unsubscribe: () => void;
};

/**
 * The active mail list owns its selection state and actions. This bridge lets
 * the app-wide palette consume them without duplicating that state.
 */
export const mailCommandContextAtom = atom<MailCommandContext | null>(null);

/** Sender actions are resolved inside the reader's account-scoped provider. */
export const senderCommandContextAtom = atom<SenderCommandContext | null>(null);
