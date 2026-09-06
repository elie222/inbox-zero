"use client";

import { type RefObject, useCallback, useMemo, useRef, useState } from "react";
import { type HotkeyCallback, useHotkeys } from "react-hotkeys-hook";
import {
  createSequencePrefixTracker,
  isTypingTarget,
  SEQUENCE_SPLIT_KEY,
  SEQUENCE_TIMEOUT_MS,
  type ShortcutEntry,
  type ShortcutHandlers,
  type ShortcutId,
  type ShortcutScope,
  SHORTCUTS,
} from "@/lib/shortcuts/registry";

type HotkeysEvent = Parameters<HotkeyCallback>[1];

type SequenceTracker = ReturnType<typeof createSequencePrefixTracker>;

const HOTKEYS_DELIMITER = "|";

type ShortcutTarget =
  | { type: "entry"; entry: ShortcutEntry }
  | { type: "prefix"; key: string };

type ShortcutBucket = {
  scope: ShortcutScope;
  allowWhileTyping: boolean;
  capture: boolean;
  /** Kept as entries so the comma key is distinct from the list delimiter. */
  keys: string[];
  targets: Map<string, ShortcutTarget>;
};

// react-hotkeys-hook takes scope and typing behaviour per hook, so bindings are
// registered as one hook per combination rather than one hook per shortcut.
const BUCKET_SPECS = [
  { scope: "global", allowWhileTyping: false, capture: false },
  { scope: "global", allowWhileTyping: false, capture: true },
  { scope: "global", allowWhileTyping: true, capture: false },
  { scope: "global", allowWhileTyping: true, capture: true },
  { scope: "mail", allowWhileTyping: false, capture: false },
  { scope: "mail", allowWhileTyping: false, capture: true },
  { scope: "mail", allowWhileTyping: true, capture: false },
  { scope: "mail", allowWhileTyping: true, capture: true },
] as const satisfies readonly {
  scope: ShortcutScope;
  allowWhileTyping: boolean;
  capture: boolean;
}[];

/**
 * Binds the registry entries the caller supplies a handler for. Entries without
 * a handler and desktop-only entries outside Electron keep their browser default.
 */
export function useShortcuts(
  handlers: ShortcutHandlers,
  { isDesktopApp = false }: { isDesktopApp?: boolean } = {},
): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [sequence] = useState(createSequencePrefixTracker);

  const signature = activeShortcutIds(handlers, isDesktopApp).join(",");
  const buckets = useMemo(() => buildBuckets(signature), [signature]);

  useShortcutBucket(buckets[0], handlersRef, sequence);
  useShortcutBucket(buckets[1], handlersRef, sequence);
  useShortcutBucket(buckets[2], handlersRef, sequence);
  useShortcutBucket(buckets[3], handlersRef, sequence);
  useShortcutBucket(buckets[4], handlersRef, sequence);
  useShortcutBucket(buckets[5], handlersRef, sequence);
  useShortcutBucket(buckets[6], handlersRef, sequence);
  useShortcutBucket(buckets[7], handlersRef, sequence);
}

function useShortcutBucket(
  bucket: ShortcutBucket,
  handlersRef: RefObject<ShortcutHandlers>,
  sequence: SequenceTracker,
) {
  const onHotkey = useCallback<HotkeyCallback>(
    (event, hotkeysEvent) => {
      const target = resolveTarget(bucket, event, hotkeysEvent);
      if (!target) return;

      if (target.type === "prefix") {
        sequence.start(target.key);
        return;
      }

      const pendingPrefix = sequence.pendingPrefix();
      if (isSequence(hotkeysEvent)) {
        sequence.resolve(event);
      } else if (sequence.wasResolvedBy(event)) {
        // A sequence owns this press: `a` belongs to `g>a`, not to reply all.
        sequence.clear();
        return;
      } else if (pendingPrefix) {
        // An abandoned prefix must not eat the next key: after `g`, a `j` still
        // moves. Only suppress when the press really does complete a sequence,
        // since then the `g>a` hotkey fires for the same keydown.
        const completesSequence = bucket.targets.has(
          `${pendingPrefix}${SEQUENCE_SPLIT_KEY}${hotkeysEvent.hotkey}`,
        );
        sequence.clear();
        if (completesSequence) return;
      }

      const { entry } = target;
      const handler =
        handlersRef.current[entry.id as ShortcutId] ?? entry.action;
      handler?.(event);
    },
    [bucket, handlersRef, sequence],
  );

  const preventDefault = useCallback(
    (event: KeyboardEvent, hotkeysEvent: HotkeysEvent) => {
      const target = resolveTarget(bucket, event, hotkeysEvent);
      return !!target && target.type === "entry";
    },
    [bucket],
  );

  useHotkeys(bucket.keys, onHotkey, {
    enabled: bucket.keys.length > 0,
    scopes: [bucket.scope],
    // Hotkeys are matched on the typed character so they survive keyboard
    // layouts that move `#` or `?`.
    useKey: true,
    enableOnFormTags: bucket.allowWhileTyping,
    enableOnContentEditable: bucket.allowWhileTyping,
    delimiter: HOTKEYS_DELIMITER,
    eventListenerOptions: bucket.capture ? { capture: true } : undefined,
    sequenceTimeoutMs: SEQUENCE_TIMEOUT_MS,
    ignoreEventWhen: (event: KeyboardEvent) => event.defaultPrevented,
    preventDefault,
  });
}

function activeShortcutIds(
  handlers: ShortcutHandlers,
  isDesktopApp: boolean,
): string[] {
  return SHORTCUTS.filter(
    (entry) =>
      (!entry.desktopOnly || isDesktopApp) &&
      (handlers[entry.id as ShortcutId] ?? entry.action),
  ).map((entry) => entry.id);
}

function buildBuckets(signature: string): ShortcutBucket[] {
  const activeIds = new Set(signature ? signature.split(",") : []);

  return BUCKET_SPECS.map((spec) => {
    const targets = new Map<string, ShortcutTarget>();

    for (const entry of SHORTCUTS) {
      if (!activeIds.has(entry.id)) continue;
      if (entry.scope !== spec.scope) continue;
      if (!!entry.allowWhileTyping !== spec.allowWhileTyping) continue;
      if (!!entry.capture !== spec.capture) continue;

      for (const key of entry.keys) {
        targets.set(key, { type: "entry", entry });

        const [prefix] = key.split(SEQUENCE_SPLIT_KEY);
        if (prefix !== key && !targets.has(prefix)) {
          targets.set(prefix, { type: "prefix", key: prefix });
        }
      }
    }

    return {
      scope: spec.scope,
      allowWhileTyping: spec.allowWhileTyping,
      capture: spec.capture,
      keys: [...targets.keys()],
      targets,
    };
  });
}

function resolveTarget(
  bucket: ShortcutBucket,
  event: KeyboardEvent,
  hotkeysEvent: HotkeysEvent,
): ShortcutTarget | undefined {
  if (!bucket.allowWhileTyping && isTypingTarget(event.target)) return;
  const target = bucket.targets.get(hotkeysEvent.hotkey);
  if (
    target?.type === "entry" &&
    target.entry.id === "commandPalette" &&
    event.target instanceof Element &&
    event.target.closest("[data-email-editor-root]")
  ) {
    return;
  }
  if (
    target?.type === "entry" &&
    ["backToList", "open", "nextSplit"].includes(target.entry.id) &&
    event.target instanceof Element &&
    event.target.closest('[role="dialog"]')
  ) {
    return;
  }
  return target;
}

function isSequence(hotkeysEvent: HotkeysEvent): boolean {
  return hotkeysEvent.hotkey.includes(SEQUENCE_SPLIT_KEY);
}
