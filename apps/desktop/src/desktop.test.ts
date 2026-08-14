import { describe, expect, it } from "vitest";
import {
  findDesktopProtocolUrl,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopLoginUrl,
  isAllowedDesktopNavigation,
  isDesktopAuthProvider,
  parseDesktopAuthCallback,
} from "./desktop";

describe("desktop shell helpers", () => {
  it("uses the production origin by default", () => {
    expect(getDesktopAppOrigin("https://www.getinboxzero.com/ignored")).toBe(
      "https://www.getinboxzero.com",
    );
    expect(getDesktopLoginUrl("https://www.getinboxzero.com")).toBe(
      "https://www.getinboxzero.com/login",
    );
  });

  it("rejects non-http app URLs", () => {
    expect(() => getDesktopAppOrigin("inboxzero-desktop://")).toThrow(
      "INBOX_ZERO_APP_URL must be an http(s) URL",
    );
  });

  it("builds the system-browser OAuth start URL", () => {
    expect(
      getDesktopBrowserStartUrl("https://www.getinboxzero.com", "google"),
    ).toBe(
      "https://www.getinboxzero.com/api/mobile-auth/browser-start?provider=google",
    );
  });

  it("parses a successful desktop auth callback", () => {
    expect(
      parseDesktopAuthCallback(
        "inboxzero-desktop://auth-callback?state=state-1&code=one-time-code",
      ),
    ).toEqual({
      ok: true,
      code: "one-time-code",
      state: "state-1",
    });
    expect(
      parseDesktopAuthCallback(
        "inboxzero-desktop:///auth-callback?state=state-1&code=one-time-code",
      ),
    ).toEqual({
      ok: true,
      code: "one-time-code",
      state: "state-1",
    });
  });

  it("parses auth callback errors without a code", () => {
    expect(
      parseDesktopAuthCallback(
        "inboxzero-desktop://auth-callback?state=state-1&error=missing_session&error_description=Authentication+session+was+not+found",
      ),
    ).toEqual({
      ok: false,
      error: "Authentication session was not found",
    });
  });

  it("ignores unknown protocol URLs", () => {
    expect(
      parseDesktopAuthCallback("https://example.com/auth-callback?code=x"),
    ).toEqual({
      ok: false,
      error: "Invalid authentication callback",
    });
  });

  it("keeps navigation on the app origin", () => {
    expect(
      isAllowedDesktopNavigation(
        "https://www.getinboxzero.com/mail",
        "https://www.getinboxzero.com",
      ),
    ).toBe(true);
    expect(
      isAllowedDesktopNavigation(
        "https://accounts.google.com/o/oauth2/v2/auth",
        "https://www.getinboxzero.com",
      ),
    ).toBe(false);
    expect(
      isAllowedDesktopNavigation("about:blank", "https://www.getinboxzero.com"),
    ).toBe(true);
  });

  it("finds the protocol URL in process arguments", () => {
    expect(
      findDesktopProtocolUrl([
        "electron",
        "inboxzero-desktop://auth-callback?code=one-time-code&state=state-1",
      ]),
    ).toBe(
      "inboxzero-desktop://auth-callback?code=one-time-code&state=state-1",
    );
    expect(isDesktopAuthProvider("google")).toBe(true);
    expect(isDesktopAuthProvider("sso")).toBe(false);
  });
});
