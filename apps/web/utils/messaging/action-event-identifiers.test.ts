import { describe, expect, it } from "vitest";
import { getSlackTeamId } from "./action-event-identifiers";

describe("getSlackTeamId", () => {
  it("reads and trims Slack team ids from nested team payloads", () => {
    expect(getSlackTeamId({ team: { id: " T_TEAM " } })).toBe("T_TEAM");
  });

  it("falls back to top-level Slack team_id payloads", () => {
    expect(getSlackTeamId({ team_id: " T_FALLBACK " })).toBe("T_FALLBACK");
  });

  it("ignores blank or missing Slack team ids", () => {
    expect(getSlackTeamId({ team: { id: " " }, team_id: "" })).toBeNull();
    expect(getSlackTeamId(null)).toBeNull();
  });
});
