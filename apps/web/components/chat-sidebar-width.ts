import type { PanelWidthBounds } from "@/utils/panel-width";

export const CHAT_SIDEBAR_WIDTH_COOKIE = "chat-sidebar-width";
export const CHAT_SIDEBAR_DEFAULT_WIDTH = 450;
export const CHAT_SIDEBAR_WIDTH_BOUNDS: PanelWidthBounds = {
  min: 360,
  max: 900,
};
const PAGE_MIN_WIDTH = 480;

/**
 * Value for `--chat-sidebar-width`, set where the left sidebar's
 * `--sidebar-width` is in scope. A wide saved width gives way when the window
 * shrinks so the page and the left sidebar beside it stay usable, but never
 * below the default the panel has always opened at.
 */
export function chatSidebarWidthCss(width: number) {
  return `min(${width}px, max(${CHAT_SIDEBAR_DEFAULT_WIDTH}px, 100vw - var(--sidebar-width) - ${PAGE_MIN_WIDTH}px))`;
}
