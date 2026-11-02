import { describe, expect, it, vi } from "vitest";
import {
  buildSnoozeCommandPalette,
  getSnoozePresets,
  parseSnoozeDate,
} from "./snooze-command-palette";

describe("buildSnoozeCommandPalette", () => {
  it("offers a short list of days and shows when each one lands", () => {
    const now = new Date(2026, 7, 18, 10);
    const commands = buildSnoozeCommandPalette({
      now,
      onSnooze: vi.fn(),
      query: "",
    });

    expect(
      commands.map((command) => [command.label, command.description]),
    ).toEqual([
      ["Tomorrow", "Wed, Aug 19 at 9:00 AM"],
      ["End of week", "Fri, Aug 21 at 9:00 AM"],
      ["This weekend", "Sat, Aug 22 at 9:00 AM"],
      ["Next week", "Mon, Aug 24 at 9:00 AM"],
    ]);
  });

  it("drops presets that have passed or would land on the same day", () => {
    const presetIdsOn = (date: Date) =>
      getSnoozePresets(date).map(({ id }) => id);

    // Thursday: tomorrow is already Friday
    expect(presetIdsOn(new Date(2026, 7, 20, 10))).toEqual([
      "tomorrow",
      "this-weekend",
      "next-week",
    ]);
    // Friday: tomorrow is already the weekend
    expect(presetIdsOn(new Date(2026, 7, 21, 10))).toEqual([
      "tomorrow",
      "next-week",
    ]);
    // Saturday
    expect(presetIdsOn(new Date(2026, 7, 22, 10))).toEqual([
      "tomorrow",
      "next-week",
    ]);
    // Sunday: tomorrow is already next week
    expect(presetIdsOn(new Date(2026, 7, 23, 10))).toEqual([
      "tomorrow",
      "end-of-week",
    ]);
  });

  it.each([
    "t",
    "tom",
    "Tomorrow",
    " tomorrow ",
  ])("offers tomorrow while typing %j", (query) => {
    const onSnooze = vi.fn();
    const commands = buildSnoozeCommandPalette({
      now: new Date(2026, 7, 18, 21),
      onSnooze,
      query,
    });

    expect(commands.length).toBeGreaterThan(0);
    commands[0]?.action();
    expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 7, 19, 9));
  });

  it("matches words within preset labels", () => {
    const now = new Date(2026, 7, 18, 10);
    const onSnooze = vi.fn();
    const commands = buildSnoozeCommandPalette({
      now,
      onSnooze,
      query: "week",
    });

    expect(commands.map(({ label }) => label)).toEqual([
      "End of week",
      "This weekend",
      "Next week",
    ]);
    const weekendCommands = buildSnoozeCommandPalette({
      now,
      onSnooze,
      query: "weeken",
    });
    expect(weekendCommands).toHaveLength(1);
    weekendCommands[0]?.action();
    expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 7, 22, 9));
  });

  it("uses the next Monday preset date for an exact next week query", () => {
    const onSnooze = vi.fn();
    const commands = buildSnoozeCommandPalette({
      now: new Date(2026, 7, 18, 10),
      onSnooze,
      query: " Next week ",
    });

    expect(commands).toHaveLength(1);
    commands[0]?.action();
    expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 7, 24, 9));
  });

  it.each([
    { day: 18, query: "next w", label: "Next week", until: 24 },
    { day: 20, query: "end", label: "End of week", until: 21 },
    { day: 21, query: "thi", label: "This weekend", until: 22 },
    { day: 23, query: "next wee", label: "Next week", until: 24 },
  ])("keeps the matching preset date for $query", ({
    day,
    query,
    label,
    until,
  }) => {
    const onSnooze = vi.fn();
    const commands = buildSnoozeCommandPalette({
      now: new Date(2026, 7, day, 10),
      onSnooze,
      query,
    });

    const command = commands.find((command) => command.label === label);
    expect(command).toBeDefined();
    command?.action();
    expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 7, until, 9));
  });

  it("turns natural language into one actionable result", () => {
    const onSnooze = vi.fn();
    const commands = buildSnoozeCommandPalette({
      now: new Date(2026, 7, 15, 10),
      onSnooze,
      query: "tomorrow at 3pm",
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]?.label).toContain("Sun, Aug 16 at 3:00 PM");
    commands[0]?.action();
    expect(onSnooze).toHaveBeenCalledWith(new Date(2026, 7, 16, 15));
  });

  it("defaults date-only input to 9am", () => {
    expect(parseSnoozeDate("next Friday", new Date(2026, 7, 15, 10))).toEqual(
      new Date(2026, 7, 21, 9),
    );
  });

  it("does not offer invalid or past dates", () => {
    const now = new Date(2026, 7, 15, 10);

    expect(parseSnoozeDate("not a date", now)).toBeNull();
    expect(parseSnoozeDate("yesterday", now)).toBeNull();
  });
});
