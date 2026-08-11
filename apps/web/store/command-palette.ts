import { atom } from "jotai";

/**
 * Open state for the command palette. It lives outside CommandK so surfaces
 * elsewhere — the mail toolbar's search field, for one — can open it without
 * faking a ⌘K keystroke.
 */
export const commandPaletteOpenAtom = atom(false);
