import { describe, expect, it, vi } from "vitest";
import {
  buildSnoozeCommandPalette,
  getSnoozePresets,
  parseSnoozeDate,
} from "./snooze-command-palette";

describe("buildSnoozeCommandPalette", () => {
  it("offers useful future presets with next week landing on Monday morning", () => {
    const presets = getSnoozePresets(new Date(2026, 7, 15, 10));

    expect(presets.map(({ id }) => id)).toEqual([
      "three-hours",
      "tomorrow",
      "next-week",
    ]);
    expect(presets[0]?.until).toEqual(new Date(2026, 7, 15, 13));
    expect(presets[1]?.until).toEqual(new Date(2026, 7, 16, 9));
    expect(presets[2]?.until).toEqual(new Date(2026, 7, 17, 9));
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
