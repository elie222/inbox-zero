/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingAuthProvider,
  getAuthErrorCategory,
  getPendingAuthProvider,
  normalizeAuthProvider,
  rememberAuthProvider,
  trackAuthFailure,
  trackAuthStarted,
} from "@/utils/analytics/auth-funnel";

describe("auth funnel analytics", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("only accepts public provider categories", () => {
    expect(normalizeAuthProvider("google")).toBe("google");
    expect(normalizeAuthProvider("microsoft")).toBe("microsoft");
    expect(normalizeAuthProvider("apple")).toBe("apple");
    expect(normalizeAuthProvider("sso")).toBe("sso");
    expect(normalizeAuthProvider("private-company-saml")).toBe("unknown");
    expect(normalizeAuthProvider(undefined)).toBe("unknown");
  });

  it("maps OAuth errors to stable categories without retaining raw details", () => {
    expect(getAuthErrorCategory("access_denied")).toBe("access_denied");
    expect(getAuthErrorCategory("invalid_code")).toBe(
      "invalid_or_expired_callback",
    );
    expect(getAuthErrorCategory("email_already_linked")).toBe(
      "account_conflict",
    );
    expect(getAuthErrorCategory("RequiresReconsent")).toBe(
      "reconsent_required",
    );
    expect(getAuthErrorCategory("contains-sensitive-provider-details")).toBe(
      "unknown",
    );
  });

  it("expires remembered providers so stale attempts are not attributed", () => {
    const now = new Date("2026-08-02T12:00:00.000Z").getTime();
    rememberAuthProvider("google", now - 14 * 60 * 1000);
    expect(getPendingAuthProvider(now)).toBe("google");

    rememberAuthProvider("microsoft", now - 16 * 60 * 1000);
    expect(getPendingAuthProvider(now)).toBe("unknown");
  });

  it("clears provider attribution after authentication succeeds", () => {
    rememberAuthProvider("google");

    clearPendingAuthProvider();

    expect(getPendingAuthProvider()).toBe("unknown");
  });

  it("captures only safe properties for starts and failures", () => {
    const capture = vi.fn();
    const posthog = { capture } as never;

    trackAuthStarted(posthog, "google");
    trackAuthFailure(posthog, {
      provider: "google",
      stage: "callback",
      errorCode: "private-error-message",
    });

    expect(capture).toHaveBeenNthCalledWith(1, "Authentication Started", {
      provider: "google",
    });
    expect(capture).toHaveBeenNthCalledWith(2, "Authentication Failed", {
      provider: "google",
      stage: "callback",
      error_category: "unknown",
      error_code: null,
    });
  });

  it("records recognisable error codes so unknown categories stay diagnosable", () => {
    const capture = vi.fn();
    const posthog = { capture } as never;

    trackAuthFailure(posthog, {
      provider: "google",
      stage: "callback",
      errorCode: "some_new_provider_code",
    });

    expect(capture).toHaveBeenCalledWith("Authentication Failed", {
      provider: "google",
      stage: "callback",
      error_category: "unknown",
      error_code: "some_new_provider_code",
    });
  });

  it("drops error codes that carry free-form provider detail", () => {
    const capture = vi.fn();
    const posthog = { capture } as never;

    trackAuthFailure(posthog, {
      provider: "microsoft",
      stage: "callback",
      errorCode: "ERR00000: Consent declined. Trace ID: 00000000-0000-0000",
    });

    expect(capture).toHaveBeenCalledWith(
      "Authentication Failed",
      expect.objectContaining({ error_code: null }),
    );
  });

  it("does not throw when browser analytics is unavailable", () => {
    const posthog = {
      capture: vi.fn(() => {
        throw new Error("Analytics unavailable");
      }),
    } as never;

    expect(() => trackAuthStarted(posthog, "google")).not.toThrow();
    expect(() =>
      trackAuthFailure(posthog, {
        provider: "google",
        stage: "start",
        errorCode: "client_error",
      }),
    ).not.toThrow();
  });
});
