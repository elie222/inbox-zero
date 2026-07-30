import { describe, expect, it } from "vitest";
import { APPS, getActiveAppId, getAppHref, getVisibleApps } from "./apps";

const EMAIL_ACCOUNT_ID = "email-account-id";

function getApp(id: string) {
  const app = APPS.find((candidate) => candidate.id === id);
  if (!app) throw new Error(`No app registered with id "${id}"`);
  return app;
}

describe("getActiveAppId", () => {
  it.each([
    ["/mail", "mail"],
    ["/compose", "mail"],
    ["/contacts", "contacts"],
    ["/tasks", "tasks"],
    ["/settings", "settings"],
    // Without this, /admin fell through to the mail branch, so the admin page
    // rendered the Mail folder list and no rail icon was highlighted.
    ["/admin", "admin"],
    ["/admin/users", "admin"],
  ])("maps %s to the %s app", (path, expected) => {
    expect(getActiveAppId(path)).toBe(expected);
  });

  it("returns null for a path that belongs to no app", () => {
    expect(getActiveAppId("/onboarding")).toBeNull();
  });
});

describe("getAppHref", () => {
  it("prefixes account-scoped apps with the email account", () => {
    expect(getAppHref(EMAIL_ACCOUNT_ID, getApp("mail"))).toContain(
      EMAIL_ACCOUNT_ID,
    );
  });

  it.each([
    "settings",
    "admin",
  ])("leaves the user-level %s app unprefixed", (id) => {
    const app = getApp(id);
    expect(getAppHref(EMAIL_ACCOUNT_ID, app)).toBe(app.path);
  });
});

describe("APPS", () => {
  it("marks admin as the only admin-only entry", () => {
    expect(APPS.filter((app) => app.adminOnly).map((app) => app.id)).toEqual([
      "admin",
    ]);
  });
});

describe("getVisibleApps", () => {
  it("hides admin-only apps from non-admins", () => {
    expect(
      getVisibleApps({ isAdmin: false }).map((app) => app.id),
    ).not.toContain("admin");
  });

  it("shows admin-only apps to admins", () => {
    expect(getVisibleApps({ isAdmin: true }).map((app) => app.id)).toContain(
      "admin",
    );
  });

  it("keeps every non-admin app in both cases", () => {
    const nonAdminApps = APPS.filter((app) => !app.adminOnly).map(
      (app) => app.id,
    );

    for (const isAdmin of [true, false]) {
      expect(getVisibleApps({ isAdmin }).map((app) => app.id)).toEqual(
        expect.arrayContaining(nonAdminApps),
      );
    }
  });
});
