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

const ALLOWED_EXTERNAL_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
]);

export function isAllowedExternalUrl(url: string): boolean {
  try {
    return ALLOWED_EXTERNAL_PROTOCOLS.has(new URL(url).protocol);
  } catch {
    return false;
  }
}

export function normalizeDesktopCallbackPath(path: unknown): string | null {
  if (
    typeof path !== "string" ||
    !path.startsWith("/") ||
    path.startsWith("//")
  ) {
    return null;
  }
  if (path.includes("\\")) return null;

  try {
    const url = new URL(path, "https://internal-path.example");
    if (url.origin !== "https://internal-path.example") return null;
    const pathname = url.pathname.replace(/^\/{2,}/u, "/");
    if (!pathname.startsWith("/") || pathname.startsWith("//")) return null;
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function getDesktopPostAuthUrl(
  appOrigin: string,
  callbackPath?: string | null,
): string {
  return new URL(
    normalizeDesktopCallbackPath(callbackPath) ?? "/login",
    appOrigin,
  ).toString();
}

export function findDesktopProtocolUrl(argv: readonly string[]): string | null {
  return argv.find(isDesktopProtocolUrl) ?? null;
}

const DESKTOP_WINDOW_BACKGROUND = "#ffffff";

export function getDesktopWindowChrome(platform = process.platform): {
  autoHideMenuBar?: boolean;
  backgroundColor: string;
  titleBarOverlay?: {
    color: string;
    height: number;
    symbolColor: string;
  };
  titleBarStyle?: "hidden" | "hiddenInset";
  trafficLightPosition?: { x: number; y: number };
} {
  if (platform === "darwin") {
    return {
      backgroundColor: DESKTOP_WINDOW_BACKGROUND,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 18 },
    };
  }

  if (platform === "win32") {
    return {
      backgroundColor: DESKTOP_WINDOW_BACKGROUND,
      titleBarOverlay: {
        color: DESKTOP_WINDOW_BACKGROUND,
        height: 36,
        symbolColor: "#0f172a",
      },
      titleBarStyle: "hidden",
    };
  }

  return {
    autoHideMenuBar: true,
    backgroundColor: DESKTOP_WINDOW_BACKGROUND,
  };
}

export const DESKTOP_WINDOW_DRAG_CSS = `
html::before,
html::after {
  content: "";
  position: fixed;
  top: 0;
  z-index: 2147483645;
  -webkit-app-region: drag;
  pointer-events: auto;
}

html::before {
  left: 0;
  width: 140px;
  height: 52px;
}

html::after {
  left: 140px;
  right: 0;
  height: 12px;
}
`.trim();
