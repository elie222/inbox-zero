import { atom } from "jotai";
import type { Command } from "@/lib/commands/types";

/**
 * Open state for the command palette. It lives outside CommandK so surfaces
 * elsewhere — the mail toolbar's search field, for one — can open it without
 * faking a ⌘K keystroke.
 */
export const commandPaletteOpenAtom = atom(false);

type CommandPalettePage = "root" | "snooze";

export const commandPalettePageAtom = atom<CommandPalettePage>("root");

type MailCommandContext = {
  commands: Command[];
  snooze: (until: Date) => void;
};

/**
 * Commands owned by the active mail list. Keeping the callbacks here lets the
 * app-wide palette act on list state without duplicating selection state.
 */
export const mailCommandContextAtom = atom<MailCommandContext | null>(null);
