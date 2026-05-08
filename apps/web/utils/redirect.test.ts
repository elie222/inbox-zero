import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildLoginRedirectUrl,
  buildRedirectUrl,
  getSafeRedirectUrl,
} from "@/utils/redirect";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildRedirectUrl", () => {
  it("returns base path when no searchParams", () => {
    expect(buildRedirectUrl("/settings")).toBe("/settings");
  });

  it("returns base path when searchParams is undefined", () => {
    expect(buildRedirectUrl("/settings", undefined)).toBe("/settings");
  });

  it("returns base path when searchParams is empty", () => {
    expect(buildRedirectUrl("/settings", {})).toBe("/settings");
  });

  it("appends a single string param", () => {
    expect(buildRedirectUrl("/settings", { tab: "email" })).toBe(
      "/settings?tab=email",
    );
  });

  it("appends multiple params", () => {
    const result = buildRedirectUrl("/settings", {
      tab: "email",
      message: "slack_connected",
    });
    expect(result).toBe("/settings?tab=email&message=slack_connected");
  });

  it("skips undefined values", () => {
    expect(
      buildRedirectUrl("/settings", { tab: "email", foo: undefined }),
    ).toBe("/settings?tab=email");
  });

  it("handles array values", () => {
    const result = buildRedirectUrl("/settings", { tag: ["a", "b"] });
    expect(result).toBe("/settings?tag=a&tag=b");
  });

  it("returns base path when all values are undefined", () => {
    expect(
      buildRedirectUrl("/settings", { foo: undefined, bar: undefined }),
    ).toBe("/settings");
  });

  it("encodes special characters", () => {
    const result = buildRedirectUrl("/settings", { q: "hello world" });
    expect(result).toBe("/settings?q=hello+world");
  });
});

describe("buildLoginRedirectUrl", () => {
  it("preserves an internal next path", () => {
    expect(buildLoginRedirectUrl("/automation?tab=settings")).toBe(
      "/login?next=%2Fautomation%3Ftab%3Dsettings",
    );
  });

  it("drops invalid next paths", () => {
    expect(buildLoginRedirectUrl("https://example.com/automation")).toBe(
      "/login",
    );
  });
});

describe("getSafeRedirectUrl", () => {
  it("preserves internal redirects", () => {
    expect(getSafeRedirectUrl("/settings?tab=profile#accounts")).toBe(
      "/settings?tab=profile#accounts",
    );
  });

  it("normalizes same-origin redirects to internal paths", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com" },
    });

    expect(
      getSafeRedirectUrl("https://app.example.com/settings?tab=profile"),
    ).toBe("/settings?tab=profile");
  });

  it("falls back for same-origin URLs that normalize to protocol-relative paths", () => {
    vi.stubGlobal("window", {
      location: { origin: "https://app.example.com" },
    });

    expect(
      getSafeRedirectUrl("https://app.example.com//example.com/path", {
        fallbackUrl: "/login",
      }),
    ).toBe("/login");
  });

  it("falls back for external redirects unless explicitly allowed", () => {
    expect(getSafeRedirectUrl("https://example.com/oauth")).toBe("/");
    expect(
      getSafeRedirectUrl("https://example.com/oauth", {
        allowExternal: true,
      }),
    ).toBe("https://example.com/oauth");
  });

  it("rejects script and non-HTTPS external redirects", () => {
    expect(
      getSafeRedirectUrl("javascript:alert(1)", {
        allowExternal: true,
        fallbackUrl: "/login",
      }),
    ).toBe("/login");
    expect(
      getSafeRedirectUrl("http://example.com/oauth", {
        allowExternal: true,
        fallbackUrl: "/login",
      }),
    ).toBe("/login");
  });
});
