export const MAIL_SIDEBAR_WIDTH_COOKIE = "mail-sidebar-width";
export const MAIL_SIDEBAR_DEFAULT_WIDTH = 236;
export const MAIL_SIDEBAR_MIN_WIDTH = 180;
export const MAIL_SIDEBAR_MAX_WIDTH = 440;
/**
 * Width of the icon-only rail the sidebar collapses to. Wide enough that the
 * mac desktop traffic lights stay clear of the thread list beside it.
 */
export const MAIL_SIDEBAR_RAIL_WIDTH = 72;

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export function clampMailSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return MAIL_SIDEBAR_DEFAULT_WIDTH;
  return Math.min(
    MAIL_SIDEBAR_MAX_WIDTH,
    Math.max(MAIL_SIDEBAR_MIN_WIDTH, Math.round(width)),
  );
}

/** Reading the cookie on the server keeps the first paint at the chosen width. */
export function persistMailSidebarWidth(width: number) {
  document.cookie = `${MAIL_SIDEBAR_WIDTH_COOKIE}=${width}; path=/; max-age=${ONE_YEAR_IN_SECONDS}; SameSite=Lax; Secure`;
}
