import { describe, expect, it } from "vitest";
import {
  findDesktopProtocolUrl,
  getDesktopAccountLinkOptions,
  getDesktopAccountLinkRedirectUrl,
  getDesktopApiErrorMessage,
  getDesktopAppOrigin,
  getDesktopBrowserStartUrl,
  getDesktopHomeUrl,
  getDesktopLocalMailUrl,
  getDesktopLoginUrl,
  DESKTOP_WINDOW_DRAG_CSS,
  getDesktopPostAuthUrl,
  getDesktopMailAccountId,
  getDesktopSessionRestoreUrl,
  getDesktopWindowDragCss,
  isAllowedDesktopNavigation,
  isAllowedExternalUrl,
  isDesktopAccountLinkCallbackUrl,
  isDesktopAccountLinkProvider,
  isDesktopAuthProvider,
  isDesktopLocalMailUrl,
  normalizeDesktopCallbackPath,
  parseDesktopAccountLinkCallback,
  parseDesktopAuthCallback,
  resolveDesktopStartUrl,
  shouldPersistDesktopUrl,
  shouldSmokeLocalMail,
  shouldUseLocalMailRenderer,
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

  it("treats INBOX_ZERO_APP_URL as the only allowed origin", () => {
    const origin = "http://mail.internal.example:8080";
    expect(getDesktopAppOrigin(`${origin}/welcome`)).toBe(origin);
    expect(getDesktopLoginUrl(origin)).toBe(`${origin}/login`);
    expect(getDesktopHomeUrl(origin)).toBe(
      `${origin}/welcome-redirect?mode=mail`,
    );
    expect(getDesktopBrowserStartUrl(origin, "google", "challenge")).toBe(
      `${origin}/api/mobile-auth/browser-start?provider=google&codeChallenge=challenge`,
    );
    expect(isAllowedDesktopNavigation(`${origin}/acc-1/mail`, origin)).toBe(
      true,
    );
    expect(
      isAllowedDesktopNavigation(
        "https://www.getinboxzero.com/acc-1/mail",
        origin,
      ),
    ).toBe(false);
    expect(isAllowedDesktopNavigation("https://evil.test/mail", origin)).toBe(
      false,
    );
    expect(
      getDesktopSessionRestoreUrl(origin, `${origin}/acc-1/mail?type=inbox`),
    ).toBe(`${origin}/acc-1/mail?type=inbox`);
    expect(
      getDesktopSessionRestoreUrl(
        origin,
        "https://www.getinboxzero.com/acc-1/mail",
      ),
    ).toBeNull();
    expect(getDesktopMailAccountId(`${origin}/acc-1/mail`, origin)).toBe(
      "acc-1",
    );
    expect(
      getDesktopMailAccountId(
        "https://www.getinboxzero.com/acc-1/mail",
        origin,
      ),
    ).toBeNull();
    expect(getDesktopPostAuthUrl(origin, "/connect-mailbox")).toBe(
      `${origin}/connect-mailbox`,
    );
  });

  it("builds the system-browser OAuth start URL", () => {
    expect(
      getDesktopBrowserStartUrl(
        "https://www.getinboxzero.com",
        "google",
        "challenge",
      ),
    ).toBe(
      "https://www.getinboxzero.com/api/mobile-auth/browser-start?provider=google&codeChallenge=challenge",
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

  it("routes account link callbacks apart from sign-in callbacks", () => {
    expect(
      isDesktopAccountLinkCallbackUrl(
        "inboxzero://account-link-callback?code=handoff-code",
      ),
    ).toBe(true);
    expect(
      isDesktopAccountLinkCallbackUrl(
        "inboxzero:///account-link-callback/?code=handoff-code",
      ),
    ).toBe(true);
    expect(
      isDesktopAccountLinkCallbackUrl(
        "inboxzero://auth-callback?state=state-1&code=one-time-code",
      ),
    ).toBe(false);
    expect(
      isDesktopAccountLinkCallbackUrl(
        "https://www.getinboxzero.com/account-link-callback?code=handoff-code",
      ),
    ).toBe(false);
    expect(
      parseDesktopAuthCallback(
        "inboxzero://account-link-callback?code=handoff-code",
      ).ok,
    ).toBe(false);
  });

  it("parses the account link handoff code", () => {
    expect(
      parseDesktopAccountLinkCallback(
        "inboxzero://account-link-callback?code=handoff-code",
      ),
    ).toEqual({ ok: true, code: "handoff-code" });
    expect(
      parseDesktopAccountLinkCallback(
        "inboxzero://account-link-callback?error=link_failed",
      ),
    ).toMatchObject({ ok: false });
    expect(
      parseDesktopAccountLinkCallback("inboxzero://account-link-callback"),
    ).toMatchObject({ ok: false });
    expect(
      parseDesktopAccountLinkCallback(
        "inboxzero://auth-callback?code=handoff-code",
      ),
    ).toMatchObject({ ok: false });
  });

  it("only accepts linking providers and a string reconnect target", () => {
    expect(isDesktopAccountLinkProvider("google")).toBe(true);
    expect(isDesktopAccountLinkProvider("microsoft")).toBe(true);
    expect(isDesktopAccountLinkProvider("apple")).toBe(false);
    expect(
      getDesktopAccountLinkOptions({ reconnectEmailAccountId: "account-1" }),
    ).toEqual({ reconnectEmailAccountId: "account-1" });
    expect(
      getDesktopAccountLinkOptions({ reconnectEmailAccountId: 1 }),
    ).toEqual({});
    expect(getDesktopAccountLinkOptions(undefined)).toEqual({});
  });

  it("keeps account link redirects on the app origin", () => {
    const origin = "https://www.getinboxzero.com";
    expect(
      getDesktopAccountLinkRedirectUrl(
        origin,
        "/accounts?success=account_created_and_linked",
      ),
    ).toBe(
      "https://www.getinboxzero.com/accounts?success=account_created_and_linked",
    );
    expect(
      getDesktopAccountLinkRedirectUrl(origin, "//evil.example/accounts"),
    ).toBe("https://www.getinboxzero.com/accounts");
    expect(
      getDesktopAccountLinkRedirectUrl(origin, "https://evil.example"),
    ).toBe("https://www.getinboxzero.com/accounts");
    expect(getDesktopAccountLinkRedirectUrl(origin, null)).toBe(
      "https://www.getinboxzero.com/accounts",
    );
  });

  it("only shows web API errors marked as known", () => {
    expect(
      getDesktopApiErrorMessage({
        error: "Account not found",
        isKnownError: true,
      }),
    ).toBe("Account not found");
    expect(getDesktopApiErrorMessage({ error: "stack trace" })).toBeNull();
    expect(getDesktopApiErrorMessage(null)).toBeNull();
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

  it("allows the bundled local mail renderer over file URLs", () => {
    const rendererFile = "/tmp/inbox-zero-desktop/renderer/index.html";
    const url = getDesktopLocalMailUrl(rendererFile, ["acc-1"]);
    expect(url.startsWith("file:")).toBe(true);
    expect(url).toContain("accountId=acc-1");
    expect(isDesktopLocalMailUrl(url, rendererFile)).toBe(true);
    expect(
      isAllowedDesktopNavigation(
        url,
        "https://www.getinboxzero.com",
        rendererFile,
      ),
    ).toBe(true);
    expect(
      isAllowedDesktopNavigation(
        "file:///etc/passwd",
        "https://www.getinboxzero.com",
        rendererFile,
      ),
    ).toBe(false);
    expect(shouldUseLocalMailRenderer({ INBOX_ZERO_LOCAL_MAIL: "1" })).toBe(
      true,
    );
    expect(shouldUseLocalMailRenderer({})).toBe(false);
    expect(shouldSmokeLocalMail({ INBOX_ZERO_LOCAL_MAIL_SMOKE: "1" })).toBe(
      true,
    );
    expect(shouldSmokeLocalMail({})).toBe(false);
    expect(
      resolveDesktopStartUrl({
        requestedUrl: "https://www.getinboxzero.com/account-1/mail",
        localMailUrl: url,
        homeUrl: "https://www.getinboxzero.com/welcome-redirect?mode=mail",
        rendererFile,
      }),
    ).toBe(url);
    expect(
      resolveDesktopStartUrl({
        requestedUrl: "https://www.getinboxzero.com/account-1/mail",
        localMailUrl: null,
        homeUrl: "https://www.getinboxzero.com/welcome-redirect?mode=mail",
        rendererFile,
      }),
    ).toBe("https://www.getinboxzero.com/account-1/mail");
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

  it("reads a mail account id only from same-origin mailbox URLs", () => {
    const origin = "https://www.getinboxzero.com";
    expect(
      getDesktopMailAccountId(`${origin}/account-1/mail?type=inbox`, origin),
    ).toBe("account-1");
    expect(getDesktopMailAccountId(`${origin}/mail`, origin)).toBeNull();
    expect(
      getDesktopMailAccountId("https://evil.test/account-1/mail", origin),
    ).toBeNull();
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
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain("[data-desktop-mac-end]");
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain(
      "[data-desktop-mac-titlebar-toggle]",
    );
    expect(DESKTOP_WINDOW_DRAG_CSS).toContain(
      "--desktop-traffic-lights-width: 78px",
    );
  });
});
