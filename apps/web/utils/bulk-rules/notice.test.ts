import { describe, expect, it } from "vitest";
import { shouldShowBulkRunNotice } from "./notice";

describe("bulk run notices", () => {
  it.each([
    "COMPLETED",
    "STOPPED",
  ] as const)("hides an empty %s run", (status) => {
    expect(shouldShowBulkRunNotice({ id: "old", status, total: 0 }, [])).toBe(
      false,
    );
  });
  it.each([
    "QUEUED",
    "SCANNING",
    "RUNNING",
    "PAUSED",
  ] as const)("keeps %s work visible before items are found", (status) => {
    expect(
      shouldShowBulkRunNotice({ id: "active", status, total: 0 }, ["active"]),
    ).toBe(true);
  });
  it("remembers dismissal of a completed run without hiding later runs", () => {
    expect(
      shouldShowBulkRunNotice({ id: "old", status: "COMPLETED", total: 3 }, [
        "old",
      ]),
    ).toBe(false);
    expect(
      shouldShowBulkRunNotice({ id: "new", status: "COMPLETED", total: 3 }, [
        "old",
      ]),
    ).toBe(true);
  });
});
