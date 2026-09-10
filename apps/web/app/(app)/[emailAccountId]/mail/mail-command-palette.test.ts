import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMailCommandPalette } from "./mail-command-palette";

const actions = {
  archive: vi.fn(),
  forward: vi.fn(),
  label: vi.fn(),
  markRead: vi.fn(),
  markSpam: vi.fn(),
  markUnread: vi.fn(),
  move: vi.fn(),
  openSnooze: vi.fn(),
  openExternal: vi.fn(),
  trash: vi.fn(),
  toggleAutoArchive: vi.fn(),
  unsubscribe: vi.fn(),
};

describe("buildMailCommandPalette", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("targets the highlighted row when no checkbox selection exists", () => {
    const commands = buildMailCommandPalette({
      actions,
      hasRead: false,
      hasUnread: true,
      targetCount: 1,
    });

    expect(
      commands.find((command) => command.id === "mail-archive"),
    ).toMatchObject({ label: "Archive conversation" });
    expect(commands.map((command) => command.id)).toEqual(
      expect.arrayContaining(["mail-mark-read", "mail-snooze"]),
    );
    expect(commands.map((command) => command.id)).not.toContain(
      "mail-mark-unread",
    );
  });

  it("labels commands for the full multi-selection", () => {
    const commands = buildMailCommandPalette({
      actions,
      hasRead: true,
      hasUnread: true,
      targetCount: 3,
    });

    expect(
      commands.find((command) => command.id === "mail-archive"),
    ).toMatchObject({ label: "Archive 3 conversations" });
    expect(commands.map((command) => command.id)).toEqual(
      expect.arrayContaining([
        "mail-mark-read",
        "mail-mark-unread",
        "mail-snooze",
      ]),
    );

    const snooze = commands.find((command) => command.id === "mail-snooze");
    expect(snooze).toMatchObject({
      label: "Snooze 3 conversations",
      shortcut: "H",
      closeOnSelect: false,
    });
    snooze?.action();
    expect(actions.openSnooze).toHaveBeenCalledOnce();
  });

  it("returns no mail actions for an empty list", () => {
    expect(
      buildMailCommandPalette({
        actions,
        hasRead: false,
        hasUnread: false,
        targetCount: 0,
      }),
    ).toEqual([]);
  });

  it("only exposes actions supported by the active mail source", () => {
    const commands = buildMailCommandPalette({
      actions: { archive: actions.archive },
      hasRead: true,
      hasUnread: true,
      targetCount: 1,
    });

    expect(commands.map((command) => command.id)).toEqual(["mail-archive"]);
  });

  it("includes the reader actions with their shortcut hints", () => {
    const commands = buildMailCommandPalette({
      actions,
      hasRead: true,
      hasUnread: false,
      isAutoArchived: false,
      isAutoArchiveDisabled: false,
      isUnsubscribeDisabled: true,
      openExternalLabel: "Open in Gmail",
      targetCount: 1,
    });

    expect(commands.map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "mail-forward",
        "mail-label",
        "mail-move",
        "mail-mark-unread",
        "mail-delete",
        "mail-mark-spam",
        "mail-unsubscribe",
        "mail-auto-archive",
        "mail-open-external",
      ]),
    );
    expect(commands.find(({ id }) => id === "mail-forward")).toMatchObject({
      shortcut: "F",
    });
    expect(commands.find(({ id }) => id === "mail-label")).toMatchObject({
      shortcut: "L",
    });
    expect(commands.find(({ id }) => id === "mail-move")).toMatchObject({
      shortcut: "V",
    });
    expect(commands.find(({ id }) => id === "mail-mark-unread")).toMatchObject({
      shortcut: "U",
    });
    expect(commands.find(({ id }) => id === "mail-unsubscribe")).toMatchObject({
      disabled: true,
    });
    expect(commands.find(({ id }) => id === "mail-auto-archive")).toMatchObject(
      { label: "Auto archive future emails", disabled: false },
    );
    expect(
      commands.find(({ id }) => id === "mail-open-external"),
    ).toMatchObject({ label: "Open in Gmail", shortcut: "G G" });
  });

  it("labels the auto-archive action from its current state", () => {
    const commands = buildMailCommandPalette({
      actions: { archive: actions.archive, toggleAutoArchive: vi.fn() },
      hasRead: false,
      hasUnread: true,
      isAutoArchived: true,
      targetCount: 1,
    });

    expect(commands.find(({ id }) => id === "mail-auto-archive")).toMatchObject(
      { label: "Disable auto archive" },
    );
  });
});
