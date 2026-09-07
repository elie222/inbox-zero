import { describe, expect, it } from "vitest";
import { getAccountSwitchUrl } from "@/utils/account-switch-url";

describe("getAccountSwitchUrl", () => {
  it("preserves the account route and tab without retaining other selections", () => {
    expect(
      getAccountSwitchUrl({
        pathname: "/current/automation?ruleId=rule",
        currentAccountId: "current",
        targetAccountId: "next",
        tab: "history",
      }),
    ).toBe("/next/automation?tab=history");
  });

  it("encodes tab values and keeps global routes intact", () => {
    expect(
      getAccountSwitchUrl({
        pathname: "/settings",
        currentAccountId: undefined,
        targetAccountId: "next",
        tab: "one&two",
      }),
    ).toBe("/settings?tab=one%26two");
  });

  it("does not replace a route segment that differs from the current account", () => {
    expect(
      getAccountSwitchUrl({
        pathname: "/accounts",
        currentAccountId: "current",
        targetAccountId: "next",
        tab: null,
      }),
    ).toBe("/accounts");
  });
});
