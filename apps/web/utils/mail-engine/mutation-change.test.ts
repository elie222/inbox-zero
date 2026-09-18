import { describe, expect, it } from "vitest";
import { mutationPayloadToChange } from "./mutation-change";

describe("mutationPayloadToChange", () => {
  it("maps list mutation kinds onto engine changes", () => {
    expect(mutationPayloadToChange({ kind: "archive" })).toEqual({
      kind: "archive",
    });
    expect(
      mutationPayloadToChange({ kind: "set_read_state", read: true }),
    ).toEqual({ kind: "set_read", read: true });
    expect(
      mutationPayloadToChange({ kind: "set_starred_state", starred: false }),
    ).toEqual({ kind: "set_starred", starred: false });
    expect(
      mutationPayloadToChange({
        kind: "snooze",
        scheduledFor: "2026-09-18T12:00:00.000Z",
      }),
    ).toEqual({
      kind: "snooze",
      untilMs: Date.parse("2026-09-18T12:00:00.000Z"),
    });
  });
});
