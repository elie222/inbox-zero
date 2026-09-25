import { describe, expect, it } from "vitest";
import { isPipedreamAppConnected } from "@/utils/mcp/pipedream-apps";

describe("isPipedreamAppConnected", () => {
  it("matches tools from the app, including variant slugs", () => {
    expect(isPipedreamAppConnected("hubspot", ["hubspot-get-contact"])).toBe(
      true,
    );
    expect(isPipedreamAppConnected("slack", ["slack_v2-list-channels"])).toBe(
      true,
    );
    expect(
      isPipedreamAppConnected("airtable", ["airtable_oauth-list-bases"]),
    ).toBe(true);
  });

  it("does not match apps whose slug only shares a prefix", () => {
    expect(isPipedreamAppConnected("asana", ["asanaplus-list-tasks"])).toBe(
      false,
    );
    expect(isPipedreamAppConnected("hubspot", ["slack_v2-list-users"])).toBe(
      false,
    );
    expect(isPipedreamAppConnected("hubspot", [])).toBe(false);
  });
});
