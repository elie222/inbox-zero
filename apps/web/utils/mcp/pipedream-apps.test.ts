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
    expect(
      isPipedreamAppConnected("salesforce", [
        "salesforce_rest_api-search-records",
      ]),
    ).toBe(true);
  });

  it("does not match other apps that share a prefix", () => {
    expect(isPipedreamAppConnected("asana", ["asanaplus-list-tasks"])).toBe(
      false,
    );
    expect(
      isPipedreamAppConnected("jira", ["jira_service_desk-list-sites"]),
    ).toBe(false);
    expect(isPipedreamAppConnected("hubspot", ["slack_v2-list-users"])).toBe(
      false,
    );
    expect(isPipedreamAppConnected("hubspot", [])).toBe(false);
  });
});
