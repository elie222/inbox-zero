import { ArchiveIcon, PenLineIcon, type LucideIcon } from "lucide-react";
import type { Command, CommandSection } from "@/lib/commands/types";
import { createClientLogger } from "@/utils/logger-client";

const logger = createClientLogger("shortcuts");

/**
 * `global` bindings are active anywhere the app mounts a `ShortcutsProvider`.
 * `mail` bindings are only active where the mail scope is enabled, so they are
 * inert on the rest of the app.
 */
export type ShortcutScope = "global" | "mail";

/** Every surface that binds mail keys also needs the global ones. */
export const MAIL_SHORTCUT_SCOPES: readonly ShortcutScope[] = [
  "global",
  "mail",
];

/** Display order of the `?` help dialog sections. */
export const SHORTCUT_GROUPS = [
  "Navigate",
  "Triage",
  "View",
  "Assistant & rules",
] as const;

export type ShortcutGroup = (typeof SHORTCUT_GROUPS)[number];

/** `g` then `a`: the second key has to land inside this window. */
export const SEQUENCE_TIMEOUT_MS = 900;

/** react-hotkeys-hook's sequence separator: `g>a` is "press g, then a". */
export const SEQUENCE_SPLIT_KEY = ">";

export type ShortcutHandler = (event?: KeyboardEvent) => void;

export type ShortcutHandlers = Partial<Record<ShortcutId, ShortcutHandler>>;

type ShortcutPalette = {
  section: CommandSection;
  description?: string;
  keywords?: readonly string[];
  priority?: number;
  icon?: LucideIcon;
};

export type ShortcutEntry = {
  id: string;
  /**
   * react-hotkeys-hook hotkey strings, matched against `event.key` so they
   * follow the character the user typed rather than the physical key.
   */
  keys: readonly string[];
  scope: ShortcutScope;
  group: ShortcutGroup;
  label: string;
  /** Overrides the keys rendered in the help dialog and the palette. */
  display?: readonly string[];
  /** Fires even while typing. Only for modifier combos and Escape. */
  allowWhileTyping?: boolean;
  /** Present means the entry shows in ⌘K once a handler is registered. */
  palette?: ShortcutPalette;
  /** Fallback when no handler is injected at the call site. */
  action?: ShortcutHandler;
};

const SHORTCUT_DEFINITIONS = [
  {
    id: "next",
    keys: ["j", "arrowdown"],
    scope: "mail",
    group: "Navigate",
    label: "Next message",
  },
  {
    id: "previous",
    keys: ["k", "arrowup"],
    scope: "mail",
    group: "Navigate",
    label: "Previous message",
  },
  {
    id: "open",
    keys: ["enter"],
    scope: "mail",
    group: "Navigate",
    label: "Open message",
  },
  {
    id: "backToList",
    keys: ["escape"],
    scope: "mail",
    group: "Navigate",
    label: "Back to the list",
    allowWhileTyping: true,
  },
  {
    id: "nextSplit",
    keys: ["tab"],
    scope: "mail",
    group: "Navigate",
    label: "Next split",
  },
  {
    id: "backToApp",
    keys: ["g>a"],
    scope: "mail",
    group: "Navigate",
    label: "Back to the app",
  },
  {
    id: "commandPalette",
    keys: ["mod+k"],
    scope: "global",
    group: "Navigate",
    label: "Command palette",
    allowWhileTyping: true,
  },
  {
    id: "select",
    keys: ["x"],
    scope: "mail",
    group: "Triage",
    label: "Select",
  },
  {
    id: "extendSelectionDown",
    keys: ["shift+arrowdown", "shift+j"],
    scope: "mail",
    group: "Triage",
    label: "Extend the selection down",
  },
  {
    id: "extendSelectionUp",
    keys: ["shift+arrowup", "shift+k"],
    scope: "mail",
    group: "Triage",
    label: "Extend the selection up",
  },
  {
    id: "archive",
    keys: ["e"],
    scope: "mail",
    group: "Triage",
    label: "Archive",
    palette: {
      section: "actions",
      description: "Archive current email",
      keywords: ["archive", "remove", "delete"],
      priority: 0,
      icon: ArchiveIcon,
    },
  },
  {
    // `#` sits behind shift on US layouts and in front of it on others.
    id: "delete",
    keys: ["shift+#", "#", "backspace"],
    display: ["#"],
    scope: "mail",
    group: "Triage",
    label: "Delete",
  },
  {
    id: "reply",
    keys: ["r"],
    scope: "mail",
    group: "Triage",
    label: "Reply",
  },
  {
    id: "replyAll",
    keys: ["a"],
    scope: "mail",
    group: "Triage",
    label: "Reply all",
  },
  {
    id: "moreActions",
    keys: ["m"],
    scope: "mail",
    group: "Triage",
    label: "More actions",
  },
  {
    id: "undo",
    keys: ["z"],
    scope: "mail",
    group: "Triage",
    label: "Undo last action",
  },
  {
    id: "toggleLayout",
    keys: ["v"],
    scope: "mail",
    group: "View",
    label: "List view / split view",
  },
  {
    id: "focusMode",
    keys: ["f"],
    scope: "mail",
    group: "View",
    label: "Focus mode (full screen)",
  },
  {
    id: "help",
    keys: ["shift+?", "?"],
    display: ["?"],
    scope: "mail",
    group: "View",
    label: "Keyboard shortcuts",
  },
  {
    id: "compose",
    keys: ["c"],
    scope: "global",
    group: "Assistant & rules",
    label: "New message",
    palette: {
      section: "actions",
      keywords: ["compose", "write", "email"],
      priority: 20,
      icon: PenLineIcon,
    },
  },
  {
    id: "send",
    keys: ["mod+enter"],
    scope: "mail",
    group: "Assistant & rules",
    label: "Send reply",
    allowWhileTyping: true,
  },
] as const satisfies readonly ShortcutEntry[];

export type ShortcutId = (typeof SHORTCUT_DEFINITIONS)[number]["id"];

/** The single source of truth behind key handling, `?` help and ⌘K. */
export const SHORTCUTS: readonly ShortcutEntry[] = SHORTCUT_DEFINITIONS;

const SHORTCUTS_BY_ID = new Map(SHORTCUTS.map((entry) => [entry.id, entry]));

export type ShortcutConflict = {
  key: string;
  ids: string[];
};

type ShortcutKeyOwner = {
  id: string;
  scope: ShortcutScope;
  viaPrefix: boolean;
};

export function getShortcut(id: ShortcutId): ShortcutEntry {
  const entry = SHORTCUTS_BY_ID.get(id);
  if (!entry) throw new Error(`Unknown shortcut: ${id}`);
  return entry;
}

export function getShortcutsForScopes(
  scopes: readonly ShortcutScope[],
): ShortcutEntry[] {
  return SHORTCUTS.filter((entry) => scopes.includes(entry.scope));
}

/** Feeds the `?` help dialog so it can never drift from the handlers. */
export function getShortcutGroups(
  scopes: readonly ShortcutScope[],
): { group: ShortcutGroup; shortcuts: ShortcutEntry[] }[] {
  const entries = getShortcutsForScopes(scopes);

  return SHORTCUT_GROUPS.map((group) => ({
    group,
    shortcuts: entries.filter((entry) => entry.group === group),
  })).filter(({ shortcuts }) => shortcuts.length > 0);
}

/** The keys as shown to the user, e.g. `⌘K`, `J / ↓`, `G A`. */
export function formatShortcutKeys(entry: ShortcutEntry): string {
  const keys = entry.display ?? entry.keys;
  return keys.map(formatKey).join(" / ");
}

export function getShortcutHint(id: ShortcutId): string {
  return formatShortcutKeys(getShortcut(id));
}

/** Feeds ⌘K: an entry appears once its handler is registered. */
export function buildShortcutPaletteCommands(
  handlers: ShortcutHandlers,
): Command[] {
  const commands: (Command & { priority: number })[] = [];

  for (const entry of SHORTCUTS) {
    const palette = entry.palette;
    if (!palette) continue;

    const handler = handlers[entry.id as ShortcutId] ?? entry.action;
    if (!handler) continue;

    commands.push({
      id: entry.id,
      label: entry.label,
      description: palette.description,
      icon: palette.icon,
      shortcut: formatShortcutKeys(entry),
      section: palette.section,
      priority: palette.priority ?? 50,
      keywords: palette.keywords ? [...palette.keywords] : undefined,
      action: () => handler(),
    });
  }

  return commands.sort((a, b) => a.priority - b.priority);
}

/**
 * Two entries owning the same key fire both handlers. Scopes that are never
 * active together are allowed to reuse a key; `global` is active alongside
 * everything, so it never can.
 */
export function findShortcutConflicts(
  entries: readonly ShortcutEntry[],
): ShortcutConflict[] {
  const owners = new Map<string, ShortcutKeyOwner[]>();

  for (const entry of entries) {
    for (const key of entry.keys) {
      addOwner(owners, key, entry, false);
      // Reserve the sequence prefix: a plain `g` binding would swallow `g>a`.
      const [prefix] = key.split(SEQUENCE_SPLIT_KEY);
      if (prefix !== key) addOwner(owners, prefix, entry, true);
    }
  }

  const conflicts: ShortcutConflict[] = [];

  for (const [key, keyOwners] of owners) {
    const clashing = keyOwners.filter((owner) =>
      keyOwners.some(
        (other) =>
          other.id !== owner.id &&
          scopesOverlap(owner.scope, other.scope) &&
          // Two sequences may share a prefix (`g>a` and `g>i`).
          !(owner.viaPrefix && other.viaPrefix),
      ),
    );
    if (clashing.length > 1) {
      conflicts.push({ key, ids: clashing.map((owner) => owner.id) });
    }
  }

  return conflicts;
}

export function assertNoShortcutConflicts(
  entries: readonly ShortcutEntry[],
): void {
  const conflicts = findShortcutConflicts(entries);
  if (conflicts.length === 0) return;
  throw new Error(`Conflicting shortcuts: ${describeConflicts(conflicts)}`);
}

/** Bindings stay inert while the user is typing, unless they're a ⌘ combo. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;

  const tagName = element.tagName.toUpperCase();
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (element.isContentEditable) return true;
  if (element.getAttribute?.("role") === "textbox") return true;

  return !!element.closest?.(
    "[contenteditable]:not([contenteditable='false'])",
  );
}

/**
 * Tracks a pending sequence prefix (`g`) so the plain binding for the second
 * key (`a` = reply all) stays quiet while a sequence is in flight.
 */
export function createSequencePrefixTracker(now: () => number = Date.now) {
  let prefix: string | null = null;
  let startedAt = 0;
  let resolvedBy: KeyboardEvent | null = null;

  return {
    start(key: string) {
      prefix = key;
      startedAt = now();
      resolvedBy = null;
    },
    pendingPrefix(): string | null {
      if (prefix && now() - startedAt >= SEQUENCE_TIMEOUT_MS) prefix = null;
      return prefix;
    },
    /**
     * A completed sequence and the plain binding for its last key are matched
     * by the same event, in an order we do not control.
     */
    resolve(event: KeyboardEvent) {
      prefix = null;
      resolvedBy = event;
    },
    wasResolvedBy(event: KeyboardEvent): boolean {
      return resolvedBy === event;
    },
    clear() {
      prefix = null;
    },
  };
}

// A conflicting registry is a bug, not a runtime condition: fail loudly while
// developing, and report it rather than crash a production session.
if (process.env.NODE_ENV === "production") {
  const conflicts = findShortcutConflicts(SHORTCUTS);
  if (conflicts.length > 0) {
    logger.error("Conflicting shortcuts", {
      conflicts: describeConflicts(conflicts),
    });
  }
} else {
  assertNoShortcutConflicts(SHORTCUTS);
}

const KEY_SYMBOLS: Record<string, string> = {
  mod: "⌘",
  meta: "⌘",
  ctrl: "⌃",
  alt: "⌥",
  shift: "⇧",
  enter: "↵",
  escape: "Esc",
  tab: "Tab",
  backspace: "⌫",
  space: "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

function formatKey(key: string): string {
  return key
    .split(SEQUENCE_SPLIT_KEY)
    .map((step) =>
      step
        .split("+")
        .map((token) => KEY_SYMBOLS[token] ?? token.toUpperCase())
        .join(""),
    )
    .join(" ");
}

function addOwner(
  owners: Map<string, ShortcutKeyOwner[]>,
  key: string,
  entry: ShortcutEntry,
  viaPrefix: boolean,
) {
  const existing = owners.get(key);
  if (viaPrefix && existing?.some((owner) => owner.id === entry.id)) return;

  const owner = { id: entry.id, scope: entry.scope, viaPrefix };
  if (existing) existing.push(owner);
  else owners.set(key, [owner]);
}

function scopesOverlap(a: ShortcutScope, b: ShortcutScope): boolean {
  return a === b || a === "global" || b === "global";
}

function describeConflicts(conflicts: ShortcutConflict[]): string {
  return conflicts
    .map(({ key, ids }) => `${key} (${ids.join(", ")})`)
    .join("; ");
}
