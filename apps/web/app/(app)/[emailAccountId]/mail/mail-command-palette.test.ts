import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMailCommandPalette } from "./mail-command-palette";

const actions = {
  archive: vi.fn(),
  markRead: vi.fn(),
  markUnread: vi.fn(),
  openSnooze: vi.fn(),
  trash: vi.fn(),
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
});
