const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export type PanelWidthBounds = { min: number; max: number };

export function clampPanelWidth(
  width: number,
  { min, max }: PanelWidthBounds,
): number | null {
  if (!Number.isFinite(width)) return null;
  return Math.min(max, Math.max(min, Math.round(width)));
}

/** Reading the cookie on the server keeps the first paint at the chosen width. */
export function parsePanelWidthCookie(
  value: string | undefined,
  bounds: PanelWidthBounds,
): number | null {
  return clampPanelWidth(Number.parseInt(value ?? "", 10), bounds);
}

/** `null` forgets the saved width so the panel goes back to its default. */
export function persistPanelWidth(cookieName: string, width: number | null) {
  const maxAge = width === null ? 0 : ONE_YEAR_IN_SECONDS;
  // Browsers drop Secure cookies on plain-HTTP origins, such as a self-hosted
  // instance without TLS.
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${cookieName}=${width ?? ""}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`;
}
