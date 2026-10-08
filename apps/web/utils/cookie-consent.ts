import { env } from "@/env";

export type CookieConsentChoice = "granted" | "denied";

export type CookieConsentState =
  | "not-required"
  | "pending"
  | CookieConsentChoice;

const STORAGE_KEY = "cookie-consent";
const CHANGE_EVENT = "cookie-consent-change";

// Keeps the choice for this page when storage is unavailable.
let memoryChoice: CookieConsentChoice | null = null;
let settingsReopened = false;

// Cookies and storage written by the trackers gated on consent, removed when a
// visitor withdraws it.
const TRACKING_COOKIE_PREFIXES = [
  "ph_",
  "_ga",
  "_gcl",
  "_gid",
  "dub_",
  "utm_",
  "gclid",
  "gbraid",
  "wbraid",
  "gad_",
  "affiliate",
  "lemon",
];
const TRACKING_STORAGE_PREFIXES = ["ph_", "__ph"];

// Location is read from the device time zone so no request is needed and the
// check works on self-hosted deployments. Every European zone is included,
// which also covers the UK, Switzerland and the EEA.
const CONSENT_TIME_ZONE_PREFIXES = ["Europe/"];
const CONSENT_TIME_ZONES = new Set([
  "Atlantic/Azores",
  "Atlantic/Canary",
  "Atlantic/Faroe",
  "Atlantic/Madeira",
  "Atlantic/Reykjavik",
  "Arctic/Longyearbyen",
  "Asia/Nicosia",
  "Asia/Famagusta",
]);

export function isConsentTimeZone(timeZone: string | undefined): boolean {
  if (!timeZone) return false;

  return (
    CONSENT_TIME_ZONE_PREFIXES.some((prefix) => timeZone.startsWith(prefix)) ||
    CONSENT_TIME_ZONES.has(timeZone)
  );
}

export function getCookieConsentState(): CookieConsentState {
  if (!hasConsentGatedTracking()) return "not-required";
  if (!isConsentTimeZone(getDeviceTimeZone())) return "not-required";

  return getStoredChoice() ?? "pending";
}

export function canUseTrackingCookies(): boolean {
  const state = getCookieConsentState();
  return state === "not-required" || state === "granted";
}

export function isCookieBannerOpen(): boolean {
  const state = getCookieConsentState();
  return state === "pending" || (settingsReopened && state !== "not-required");
}

export function setCookieConsent(choice: CookieConsentChoice) {
  const previous = getStoredChoice();
  settingsReopened = false;
  const persisted = writeStoredChoice(choice);
  memoryChoice = persisted ? null : choice;

  if (choice === "denied" && previous === "granted") {
    clearTrackingStorage();

    // Reloading into a grant still left in storage would resume tracking, so
    // only reload once that grant is gone. Otherwise the in-memory denial
    // holds for this page.
    if (persisted || removeStoredChoice()) {
      // Scripts that already loaded keep running until the page is reloaded.
      window.location.reload();
      return;
    }
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function reopenCookieConsent() {
  settingsReopened = true;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToCookieConsent(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;

    // Consent withdrawn in another tab must also stop the scripts loaded here.
    if (event.oldValue === "granted" && event.newValue !== "granted") {
      window.location.reload();
      return;
    }

    onChange();
  };

  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function hasConsentGatedTracking() {
  return Boolean(
    env.NEXT_PUBLIC_POSTHOG_KEY ||
      env.NEXT_PUBLIC_GTM_ID ||
      env.NEXT_PUBLIC_DUB_REFER_DOMAIN ||
      env.NEXT_PUBLIC_CONVERSION_ANALYTICS_SCRIPT_URL ||
      env.NEXT_PUBLIC_SENTRY_DSN,
  );
}

function getDeviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return;
  }
}

function getStoredChoice(): CookieConsentChoice | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    if (value === "granted" || value === "denied") return value;
  } catch {}

  return memoryChoice;
}

function writeStoredChoice(choice: CookieConsentChoice): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

function removeStoredChoice(): boolean {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function clearTrackingStorage() {
  const cookieNames = document.cookie
    .split("; ")
    .map((cookie) => cookie.split("=")[0])
    .filter((name) =>
      TRACKING_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix)),
    );

  // Analytics cookies are often set on the parent domain, so expire each one
  // on every domain level it could live on.
  const hostParts = window.location.hostname.split(".");
  const domains = hostParts.map((_, index) => hostParts.slice(index).join("."));

  for (const name of cookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/`;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; path=/; domain=${domain}`;
    }
  }

  try {
    for (const key of Object.keys(window.localStorage)) {
      if (TRACKING_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
  } catch {}
}
