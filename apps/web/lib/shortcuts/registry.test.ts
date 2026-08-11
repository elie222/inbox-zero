// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  assertNoShortcutConflicts,
  buildShortcutPaletteCommands,
  createSequencePrefixTracker,
  findShortcutConflicts,
  formatShortcutKeys,
  getShortcut,
  getShortcutGroups,
  isTypingTarget,
  SEQUENCE_TIMEOUT_MS,
  type ShortcutEntry,
  SHORTCUTS,
} from "./registry";

describe("shortcut registry", () => {
  it("gives every key a single owner", () => {
    expect(findShortcutConflicts(SHORTCUTS)).toEqual([]);
  });

  it("lists every shortcut in exactly one help group", () => {
    const grouped = getShortcutGroups(["global", "mail"]).flatMap(
      ({ shortcuts }) => shortcuts,
    );

    expect(grouped).toHaveLength(SHORTCUTS.length);
    expect(new Set(grouped.map((entry) => entry.id)).size).toBe(
      SHORTCUTS.length,
    );
  });

  it("leaves mail shortcuts out of a global-only surface", () => {
    const grouped = getShortcutGroups(["global"]).flatMap(
      ({ shortcuts }) => shortcuts,
    );

    expect(grouped.every((entry) => entry.scope === "global")).toBe(true);
    expect(grouped.map((entry) => entry.id)).toContain("commandPalette");
  });

  it("renders keys the way the help dialog and palette show them", () => {
    expect(formatShortcutKeys(getShortcut("next"))).toBe("J / ↓");
    expect(formatShortcutKeys(getShortcut("commandPalette"))).toBe("⌘K");
    expect(formatShortcutKeys(getShortcut("send"))).toBe("⌘↵");
    expect(formatShortcutKeys(getShortcut("backToApp"))).toBe("G A");
    expect(formatShortcutKeys(getShortcut("delete"))).toBe("#");
  });
});

describe("findShortcutConflicts", () => {
  it("flags two shortcuts owning the same key in one scope", () => {
    const conflicts = findShortcutConflicts([
      buildEntry({ id: "archive", keys: ["e"] }),
      buildEntry({ id: "expand", keys: ["e"] }),
    ]);

    expect(conflicts).toEqual([{ key: "e", ids: ["archive", "expand"] }]);
  });

  it("flags a global shortcut colliding with a mail shortcut", () => {
    const conflicts = findShortcutConflicts([
      buildEntry({ id: "compose", keys: ["c"], scope: "global" }),
      buildEntry({ id: "categorize", keys: ["c"], scope: "mail" }),
    ]);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].ids).toEqual(["compose", "categorize"]);
  });

  it("flags a plain binding that swallows a sequence prefix", () => {
    const conflicts = findShortcutConflicts([
      buildEntry({ id: "backToApp", keys: ["g>a"] }),
      buildEntry({ id: "goToInbox", keys: ["g"] }),
    ]);

    expect(conflicts).toEqual([{ key: "g", ids: ["backToApp", "goToInbox"] }]);
  });

  it("lets two sequences share a prefix", () => {
    const conflicts = findShortcutConflicts([
      buildEntry({ id: "backToApp", keys: ["g>a"] }),
      buildEntry({ id: "goToInbox", keys: ["g>i"] }),
    ]);

    expect(conflicts).toEqual([]);
  });

  it("throws naming both shortcuts", () => {
    expect(() =>
      assertNoShortcutConflicts([
        buildEntry({ id: "archive", keys: ["e"] }),
        buildEntry({ id: "expand", keys: ["e"] }),
      ]),
    ).toThrow(/archive, expand/);
  });
});

describe("isTypingTarget", () => {
  it.each(["input", "textarea", "select"])("guards <%s>", (tagName) => {
    expect(isTypingTarget(document.createElement(tagName))).toBe(true);
  });

  it("guards contenteditable, including nested nodes", () => {
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    const child = document.createElement("span");
    editable.append(child);
    document.body.append(editable);

    expect(isTypingTarget(editable)).toBe(true);
    expect(isTypingTarget(child)).toBe(true);

    editable.remove();
  });

  it("guards elements that behave like a text box", () => {
    const element = document.createElement("div");
    element.setAttribute("role", "textbox");

    expect(isTypingTarget(element)).toBe(true);
  });

  it("lets shortcuts through for everything else", () => {
    expect(isTypingTarget(document.createElement("button"))).toBe(false);
    expect(isTypingTarget(document.body)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe("createSequencePrefixTracker", () => {
  it("keeps the prefix pending inside the window", () => {
    let now = 0;
    const tracker = createSequencePrefixTracker(() => now);

    tracker.start("g");
    now = SEQUENCE_TIMEOUT_MS - 1;

    expect(tracker.pendingPrefix()).toBe("g");
  });

  it("drops the prefix once the window closes", () => {
    let now = 0;
    const tracker = createSequencePrefixTracker(() => now);

    tracker.start("g");
    now = SEQUENCE_TIMEOUT_MS;

    expect(tracker.pendingPrefix()).toBeNull();
  });

  it("drops the prefix when the sequence is abandoned", () => {
    const tracker = createSequencePrefixTracker();

    tracker.start("g");
    tracker.clear();

    expect(tracker.pendingPrefix()).toBeNull();
  });

  it("marks the press that completed the sequence", () => {
    const tracker = createSequencePrefixTracker();
    const completing = new KeyboardEvent("keydown", { key: "a" });

    tracker.start("g");
    tracker.resolve(completing);

    expect(tracker.pendingPrefix()).toBeNull();
    expect(tracker.wasResolvedBy(completing)).toBe(true);
    expect(
      tracker.wasResolvedBy(new KeyboardEvent("keydown", { key: "a" })),
    ).toBe(false);
  });
});

describe("buildShortcutPaletteCommands", () => {
  it("surfaces a shortcut once its handler is registered", () => {
    expect(buildShortcutPaletteCommands({})).toEqual([]);

    const archive = vi.fn();
    const [command, ...rest] = buildShortcutPaletteCommands({ archive });

    expect(rest).toEqual([]);
    expect(command).toMatchObject({
      id: "archive",
      label: "Archive",
      section: "actions",
      shortcut: "E",
    });

    command.action();
    expect(archive).toHaveBeenCalledOnce();
  });

  it("leaves shortcuts without palette metadata out", () => {
    const commands = buildShortcutPaletteCommands({ compose: vi.fn() });

    expect(commands.map((command) => command.id)).not.toContain("compose");
  });
});

function buildEntry(overrides: Partial<ShortcutEntry>): ShortcutEntry {
  return {
    id: "test",
    keys: ["t"],
    scope: "mail",
    group: "Triage",
    label: "Test",
    ...overrides,
  };
}
