import { describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/electron/main";
import { captureDesktopError, scrubBreadcrumb, scrubEvent } from "./sentry";

vi.hoisted(() => {
  process.env.INBOX_ZERO_SENTRY_DSN = "https://key@sentry.invalid/1";
});
vi.mock("electron", () => ({ app: { getVersion: () => "0.0.0" } }));
vi.mock("@sentry/electron/main", () => ({
  init: vi.fn(),
  captureException: vi.fn(),
}));

describe("scrubBreadcrumb", () => {
  it("drops console output and query strings before breadcrumbs leave the app", () => {
    expect(scrubBreadcrumb({ category: "console", message: "Subject" })).toBe(
      null,
    );
    expect(
      scrubBreadcrumb({
        category: "electron",
        data: {
          url: "https://www.getinboxzero.com/acc/mail?thread-id=t1&q=invoice",
          from: "/acc/mail?q=invoice#reply",
          status: 200,
        },
      }),
    ).toEqual({
      category: "electron",
      data: {
        url: "https://www.getinboxzero.com/acc/mail",
        from: "/acc/mail",
        status: 200,
      },
    });
  });
});

describe("scrubEvent", () => {
  it("drops the query from a crashed renderer's URL", () => {
    const event = scrubEvent({
      type: undefined,
      contexts: {
        electron: {
          crashed_url: "https://www.getinboxzero.com/acc/mail?q=invoice",
        },
      },
    });
    expect(event.contexts?.electron?.crashed_url).toBe(
      "https://www.getinboxzero.com/acc/mail",
    );
  });
});

describe("captureDesktopError", () => {
  it("reports a repeating failure once per interval", () => {
    const tags = { area: "mail-engine" };
    captureDesktopError(new Error("database is locked"), tags, { now: 0 });
    captureDesktopError(new Error("database is locked"), tags, { now: 60_000 });
    captureDesktopError(new Error("network down"), tags, { now: 60_000 });
    captureDesktopError(new Error("database is locked"), tags, {
      now: 11 * 60_000,
    });

    expect(Sentry.captureException).toHaveBeenCalledTimes(3);
  });
});
