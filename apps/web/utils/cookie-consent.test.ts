// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  canUseTrackingCookies,
  getCookieConsentState,
  isConsentTimeZone,
  reopenCookieConsent,
  setCookieConsent,
  subscribeToCookieConsent,
} from "./cookie-consent";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_POSTHOG_KEY: "phc_test" },
}));

describe("isConsentTimeZone", () => {
  it.each([
    ["Europe/Berlin", true],
    ["Europe/London", true],
    ["Atlantic/Canary", true],
    ["Asia/Nicosia", true],
    ["America/New_York", false],
    ["Asia/Tokyo", false],
    [undefined, false],
  ])("%s requires consent: %s", (timeZone, expected) => {
    expect(isConsentTimeZone(timeZone)).toBe(expected);
  });
});

describe("cookie consent state", () => {
  beforeEach(() => {
    window.localStorage.clear();
    for (const cookie of document.cookie.split("; ")) {
      const name = cookie.split("=")[0];
      if (name) document.cookie = `${name}=; Max-Age=0; path=/`;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not ask visitors outside consent regions", () => {
    useTimeZone("America/New_York");

    expect(getCookieConsentState()).toBe("not-required");
    expect(canUseTrackingCookies()).toBe(true);
  });

  it("blocks tracking in consent regions until the visitor accepts", () => {
    useTimeZone("Europe/Paris");
    const onChange = vi.fn();
    const unsubscribe = subscribeToCookieConsent(onChange);

    expect(getCookieConsentState()).toBe("pending");
    expect(canUseTrackingCookies()).toBe(false);

    setCookieConsent("granted");

    expect(getCookieConsentState()).toBe("granted");
    expect(canUseTrackingCookies()).toBe(true);
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("keeps tracking off after the visitor rejects", () => {
    useTimeZone("Europe/Madrid");

    setCookieConsent("denied");

    expect(getCookieConsentState()).toBe("denied");
    expect(canUseTrackingCookies()).toBe(false);
  });

  it("asks again when the visitor reopens cookie settings", () => {
    useTimeZone("Europe/Rome");
    setCookieConsent("denied");

    reopenCookieConsent();

    expect(getCookieConsentState()).toBe("pending");
  });

  it("removes tracking cookies and storage when consent is withdrawn", () => {
    useTimeZone("Europe/Berlin");
    setCookieConsent("granted");
    document.cookie = "ph_phc_test_posthog=1; path=/";
    document.cookie = "_ga=1; path=/";
    document.cookie = "session_token=1; path=/";
    window.localStorage.setItem("ph_phc_test_posthog", "1");
    window.localStorage.setItem("app-setting", "1");
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      hostname: window.location.hostname,
      reload,
    });

    setCookieConsent("denied");

    expect(document.cookie).not.toContain("ph_phc_test_posthog");
    expect(document.cookie).not.toContain("_ga");
    expect(document.cookie).toContain("session_token=1");
    expect(window.localStorage.getItem("ph_phc_test_posthog")).toBeNull();
    expect(window.localStorage.getItem("app-setting")).toBe("1");
    expect(reload).toHaveBeenCalled();
  });
});

function useTimeZone(timeZone: string) {
  vi.spyOn(Intl.DateTimeFormat.prototype, "resolvedOptions").mockReturnValue({
    ...new Intl.DateTimeFormat().resolvedOptions(),
    timeZone,
  });
}
