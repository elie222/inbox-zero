import { describe, expect, it } from "vitest";
import { rollUpUserStatus } from "./user-status";

describe("rollUpUserStatus", () => {
  it("has no status for a user with no mailboxes", () => {
    expect(rollUpUserStatus([])).toBeNull();
  });

  // A user whose other mailbox is working is not broken, so "active" outranks
  // everything. Among the rest, "disconnected" comes first because it is the
  // only state an admin can act on.
  it.each([
    [["inactive", "active"], "active"],
    [["disconnected", "active"], "active"],
    [["none", "disconnected"], "disconnected"],
    [["inactive", "disconnected"], "disconnected"],
    [["none", "inactive"], "inactive"],
    [["none"], "none"],
  ] as const)("rolls %j up to %s", (statuses, expected) => {
    expect(rollUpUserStatus([...statuses])).toBe(expected);
  });

  it("ignores the hidden state, which admins never see", () => {
    expect(rollUpUserStatus(["hidden", "inactive"])).toBe("inactive");
  });
});
