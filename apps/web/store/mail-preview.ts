import { atom } from "jotai";

/**
 * True while the mail screen is mounted beside the chat. Chat email cards then
 * open over the mail screen instead of expanding inside the narrow chat panel.
 */
export const mailScreenMountedAtom = atom(false);

/**
 * The thread a chat email card opened over the mail screen. It sits on top of
 * the list and reader so the user's place underneath is left untouched.
 */
export const mailPreviewAtom = atom<{
  emailAccountId: string;
  threadId: string;
} | null>(null);
