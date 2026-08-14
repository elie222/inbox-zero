export const DESKTOP_PROTOCOL = "inboxzero-desktop";
export const DESKTOP_AUTH_CALLBACK_PATH = "/auth-callback";
export const DEFAULT_APP_URL = "https://www.getinboxzero.com";
export const DESKTOP_AUTH_PROVIDERS = ["apple", "google", "microsoft"] as const;

export type DesktopAuthProvider = (typeof DESKTOP_AUTH_PROVIDERS)[number];

export type DesktopAuthCallback =
  | { ok: true; code: string; state: string }
  | { ok: false; error: string };

export function getDesktopAppOrigin(
  appUrl = process.env.INBOX_ZERO_APP_URL ?? DEFAULT_APP_URL,
): string {
  const parsed = new URL(appUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("INBOX_ZERO_APP_URL must be an http(s) URL");
  }
  return parsed.origin;
}

export function getDesktopLoginUrl(appOrigin: string): string {
  return new URL("/login", appOrigin).toString();
}

export function getDesktopBrowserStartUrl(
  appOrigin: string,
  provider: DesktopAuthProvider,
): string {
  const url = new URL("/api/mobile-auth/browser-start", appOrigin);
  url.searchParams.set("provider", provider);
  return url.toString();
}

export function isDesktopAuthProvider(
  value: unknown,
): value is DesktopAuthProvider {
  return (
    typeof value === "string" &&
    (DESKTOP_AUTH_PROVIDERS as readonly string[]).includes(value)
  );
}

export function isDesktopProtocolUrl(url: string): boolean {
  try {
    return new URL(url).protocol === `${DESKTOP_PROTOCOL}:`;
  } catch {
    return false;
  }
}

export function parseDesktopAuthCallback(url: string): DesktopAuthCallback {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: "Invalid authentication callback" };
  }

  if (parsed.protocol !== `${DESKTOP_PROTOCOL}:`) {
    return { ok: false, error: "Invalid authentication callback" };
  }

  const path = `${parsed.hostname}${parsed.pathname}`
    .replace(/^\/+/u, "")
    .replace(/\/+$/u, "");
  if (path !== "auth-callback") {
    return { ok: false, error: "Invalid authentication callback" };
  }

  const error = parsed.searchParams.get("error");
  if (error) {
    return {
      ok: false,
      error: parsed.searchParams.get("error_description") || error,
    };
  }

  const code = parsed.searchParams.get("code")?.trim() ?? "";
  const state = parsed.searchParams.get("state")?.trim() ?? "";
  if (!code || !state) {
    return { ok: false, error: "Authentication did not finish" };
  }

  return { ok: true, code, state };
}

export function isAllowedDesktopNavigation(
  url: string,
  appOrigin: string,
): boolean {
  if (url === "about:blank") return true;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  return parsed.origin === appOrigin;
}

export function findDesktopProtocolUrl(argv: readonly string[]): string | null {
  return argv.find(isDesktopProtocolUrl) ?? null;
}
