import { describe, expect, it } from "vitest";
import {
  findDesktopProtocolUrl,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopHomeUrl,
  getDesktopLoginUrl,
  DESKTOP_WINDOW_DRAG_CSS,
  getDesktopPostAuthUrl,
  getDesktopSessionRestoreUrl,
  getDesktopWindowChrome,
  getDesktopWindowDragCss,
  isAllowedDesktopNavigation,
  isAllowedExternalUrl,
  isDesktopAuthProvider,
  normalizeDesktopCallbackPath,
  parseDesktopAuthCallback,
  shouldPersistDesktopUrl,
} from "./desktop";

describe("desktop shell helpers", () => {
  it("uses the production origin by default", () => {
    expect(getDesktopAppOrigin("https://www.getinboxzero.com/ignored")).toBe(
      "https://www.getinboxzero.com",
    );
    expect(getDesktopLoginUrl("https://www.getinboxzero.com")).toBe(
      "https://www.getinboxzero.com/login",
    );
    expect(getDesktopHomeUrl("https://www.getinboxzero.com")).toBe(
      "https://www.getinboxzero.com/welcome-redirect?mode=mail",
    );
  });

  it("rejects non-http app URLs", () => {
    expect(() => getDesktopAppOrigin("inboxzero://")).toThrow(
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
        "inboxzero://auth-callback?state=state-1&code=one-time-code",
      ),
    ).toEqual({
      ok: true,
      code: "one-time-code",
      state: "state-1",
    });
    expect(
      parseDesktopAuthCallback(
        "inboxzero:///auth-callback?state=state-1&code=one-time-code",
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
        "inboxzero://auth-callback?state=state-1&error=missing_session&error_description=Authentication+session+was+not+found",
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
        "inboxzero://auth-callback?code=one-time-code&state=state-1",
      ]),
    ).toBe("inboxzero://auth-callback?code=one-time-code&state=state-1");
    expect(isDesktopAuthProvider("google")).toBe(true);
    expect(isDesktopAuthProvider("sso")).toBe(false);
  });

  it("only opens http(s), mailto, and tel URLs externally", () => {
    expect(
      isAllowedExternalUrl("https://accounts.google.com/o/oauth2/v2/auth"),
    ).toBe(true);
    expect(isAllowedExternalUrl("mailto:hello@getinboxzero.com")).toBe(true);
    expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
    expect(isAllowedExternalUrl("inboxzero://auth-callback")).toBe(false);
  });

  it("loads a validated post-auth path and falls back to mail", () => {
    expect(
      getDesktopPostAuthUrl(
        "https://www.getinboxzero.com",
        "/connect-mailbox?next=%2Fwelcome-redirect",
      ),
    ).toBe(
      "https://www.getinboxzero.com/connect-mailbox?next=%2Fwelcome-redirect",
    );
    expect(
      getDesktopPostAuthUrl(
        "https://www.getinboxzero.com",
        "https://evil.test",
      ),
    ).toBe("https://www.getinboxzero.com/welcome-redirect?mode=mail");
    expect(normalizeDesktopCallbackPath("//evil.test")).toBeNull();
    expect(normalizeDesktopCallbackPath("/.//evil.test")).toBe("/evil.test");
    expect(
      getDesktopPostAuthUrl("https://www.getinboxzero.com", "/.//evil.test"),
    ).toBe("https://www.getinboxzero.com/evil.test");
  });

  it("uses a light hidden title bar so the native chrome matches the web app", () => {
    expect(getDesktopWindowChrome("darwin")).toEqual({
      backgroundColor: "#ffffff",
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    });
    expect(getDesktopWindowChrome("win32")).toMatchObject({
      backgroundColor: "#ffffff",
      titleBarStyle: "hidden",
      titleBarOverlay: {
        color: "#ffffff",
        height: 36,
        symbolColor: "#0f172a",
      },
    });
    expect(getDesktopWindowChrome("linux")).toEqual({
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
    });
  });

  it("persists in-app pages but not auth or API URLs", () => {
    const origin = "https://www.getinboxzero.com";
    expect(
      shouldPersistDesktopUrl(`${origin}/account-1/automation`, origin),
    ).toBe(true);
    expect(
      shouldPersistDesktopUrl(`${origin}/account-1/mail?type=inbox`, origin),
    ).toBe(true);
    expect(shouldPersistDesktopUrl(`${origin}/login`, origin)).toBe(false);
    expect(
      shouldPersistDesktopUrl(`${origin}/login?next=%2Fmail`, origin),
    ).toBe(false);
    expect(shouldPersistDesktopUrl(`${origin}/api/user/me`, origin)).toBe(
      false,
    );
    expect(
      shouldPersistDesktopUrl("https://accounts.google.com/signin", origin),
    ).toBe(false);
    expect(shouldPersistDesktopUrl("not a url", origin)).toBe(false);
    // "/loginish" is a real page, not the login route
    expect(shouldPersistDesktopUrl(`${origin}/loginish`, origin)).toBe(true);
  });

  it("restores only validated mail URLs on launch", () => {
    const origin = "https://www.getinboxzero.com";
    expect(
      getDesktopSessionRestoreUrl(
        origin,
        `${origin}/account-1/mail?type=archive`,
      ),
    ).toBe(`${origin}/account-1/mail?type=archive`);
    expect(
      getDesktopSessionRestoreUrl(origin, `${origin}/account-1/automation`),
    ).toBeNull();
    expect(getDesktopSessionRestoreUrl(origin, `${origin}/login`)).toBeNull();
    expect(
      getDesktopSessionRestoreUrl(origin, "https://evil.test/automation"),
    ).toBeNull();
    expect(getDesktopSessionRestoreUrl(origin, null)).toBeNull();
    expect(getDesktopSessionRestoreUrl(origin, 42)).toBeNull();
  });

  it("scopes window dragging to a titlebar strip instead of the whole page", () => {
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain("-webkit-app-region: drag");
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain("html::before");
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain("height: 12px");
    expect(DESKTOP_WINDOW_DRAG_CSS).not.toContain("html {");
    expect(getDesktopWindowDragCss("darwin")).toBe(DESKTOP_WINDOW_DRAG_CSS);
    expect(getDesktopWindowDragCss("win32")).toBeNull();
    expect(getDesktopWindowDragCss("linux")).toBeNull();
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain("[data-hide-on-desktop-mac]");
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain(
      "--desktop-traffic-lights-width: 78px",
    );
  });
});
