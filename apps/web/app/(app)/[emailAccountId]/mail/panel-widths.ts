import type { PanelWidthBounds } from "@/utils/panel-width";

export const MAIL_SIDEBAR_WIDTH_COOKIE = "mail-sidebar-width";
export const MAIL_SIDEBAR_DEFAULT_WIDTH = 236;
export const MAIL_SIDEBAR_WIDTH_BOUNDS: PanelWidthBounds = {
  min: 180,
  max: 440,
};
/** Width of the icon-only rail the sidebar collapses to on the web. */
export const MAIL_SIDEBAR_RAIL_WIDTH = 72;

/** Split-layout thread list. Without a saved width it scales with the window. */
export const MAIL_LIST_WIDTH_COOKIE = "mail-list-width";
export const MAIL_LIST_WIDTH_BOUNDS: PanelWidthBounds = { min: 258, max: 720 };
