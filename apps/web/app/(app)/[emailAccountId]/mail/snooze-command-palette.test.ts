import { describe, expect, it, vi } from "vitest";
import {
  buildSnoozeCommandPalette,
  getSnoozePresets,
  parseSnoozeDate,
} from "./snooze-command-palette";

describe("buildSnoozeCommandPalette", () => {
  it("offers named times of day and shows when each one lands", () => {
    const now = new Date(2026, 7, 18, 10);
    const presets = getSnoozePresets(now);
    const commands = buildSnoozeCommandPalette({
      now,
      onSnooze: vi.fn(),
      query: "",
    });

    expect(presets.map(({ id }) => id)).toEqual([
      "this-afternoon",
      "this-evening",
      "tomorrow-morning",
      "this-weekend",
      "next-monday",
      "next-week",
    ]);
    expect(presets.map(({ until }) => until)).toEqual([
      new Date(2026, 7, 18, 17),
      new Date(2026, 7, 18, 20),
      new Date(2026, 7, 19, 9),
      new Date(2026, 7, 22, 9),
      new Date(2026, 7, 24, 9),
      new Date(2026, 7, 25, 9),
    ]);
    expect(
      commands.map((command) => [command.label, command.description]),
    ).toEqual([
      ["This afternoon", "Tue, Aug 18 at 5:00 PM"],
      ["This evening", "Tue, Aug 18 at 8:00 PM"],
      ["Tomorrow morning", "Wed, Aug 19 at 9:00 AM"],
      ["This weekend", "Sat, Aug 22 at 9:00 AM"],
      ["Next Monday", "Mon, Aug 24 at 9:00 AM"],
      ["Next week", "Tue, Aug 25 at 9:00 AM"],
    ]);
  });

  it("hides named times that have already passed", () => {
    expect(
      getSnoozePresets(new Date(2026, 7, 18, 17, 1)).map(({ id }) => id),
    ).toEqual([
      "this-evening",
      "tomorrow-morning",
      "this-weekend",
      "next-monday",
      "next-week",
    ]);
    expect(
      getSnoozePresets(new Date(2026, 7, 18, 20, 1)).map(({ id }) => id),
    ).toEqual(["tomorrow-morning", "this-weekend", "next-monday", "next-week"]);
  });

  it("skips presets that would land on the same time", () => {
    expect(
      getSnoozePresets(new Date(2026, 7, 16, 10)).map(({ id }) => id),
    ).toEqual([
      "this-afternoon",
      "this-evening",
      "tomorrow-morning",
      "next-week",
    ]);
    expect(
      getSnoozePresets(new Date(2026, 7, 17, 10)).map(({ id }) => id),
    ).toEqual([
      "this-afternoon",
      "this-evening",
      "tomorrow-morning",
      "this-weekend",
      "next-monday",
    ]);
    expect(
      getSnoozePresets(new Date(2026, 7, 21, 10)).map(({ id }) => id),
    ).toEqual([
      "this-afternoon",
      "this-evening",
      "tomorrow-morning",
      "next-monday",
      "next-week",
    ]);
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
