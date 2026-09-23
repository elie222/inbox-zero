import { describe, expect, it, vi } from "vitest";
import { scrubBreadcrumb } from "./sentry";

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
