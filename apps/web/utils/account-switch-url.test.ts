import { describe, expect, it } from "vitest";
import {
  getAccountSwitchUrl,
  unownedAccountRedirectUrl,
} from "@/utils/account-switch-url";

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

describe("unownedAccountRedirectUrl", () => {
  it("replaces a deleted account route with the remaining account", () => {
    expect(
      unownedAccountRedirectUrl({
        pathname: "/deleted/mail",
        routeAccountId: "deleted",
        ownedRouteId: null,
        fallbackAccountId: "account-1",
        tab: null,
      }),
    ).toBe("/account-1/mail");
  });

  it("keeps the settings tab when leaving a deleted account route", () => {
    expect(
      unownedAccountRedirectUrl({
        pathname: "/deleted/settings",
        routeAccountId: "deleted",
        ownedRouteId: null,
        fallbackAccountId: "account-1",
        tab: "connected-accounts",
      }),
    ).toBe("/account-1/settings?tab=connected-accounts");
  });

  it("does not redirect when the route account is still owned", () => {
    expect(
      unownedAccountRedirectUrl({
        pathname: "/account-1/mail",
        routeAccountId: "account-1",
        ownedRouteId: "account-1",
        fallbackAccountId: "account-2",
        tab: null,
      }),
    ).toBeNull();
  });

  it("does not redirect global routes that are not account-scoped", () => {
    expect(
      unownedAccountRedirectUrl({
        pathname: "/accounts",
        routeAccountId: "deleted",
        ownedRouteId: null,
        fallbackAccountId: "account-1",
        tab: null,
      }),
    ).toBeNull();
    expect(
      unownedAccountRedirectUrl({
        pathname: "/settings",
        routeAccountId: "deleted",
        ownedRouteId: null,
        fallbackAccountId: "account-1",
        tab: null,
      }),
    ).toBeNull();
  });

  it("does not redirect before a remaining account exists", () => {
    expect(
      unownedAccountRedirectUrl({
        pathname: "/deleted/mail",
        routeAccountId: "deleted",
        ownedRouteId: null,
        fallbackAccountId: undefined,
        tab: null,
      }),
    ).toBeNull();
    expect(
      unownedAccountRedirectUrl({
        pathname: "/deleted/mail",
        routeAccountId: undefined,
        ownedRouteId: null,
        fallbackAccountId: "account-1",
        tab: null,
      }),
    ).toBeNull();
  });
});
