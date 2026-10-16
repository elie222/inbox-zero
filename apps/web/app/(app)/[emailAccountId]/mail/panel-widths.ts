import type { PanelWidthConfig } from "@/utils/panel-width";

export const MAIL_SIDEBAR_WIDTH: PanelWidthConfig = {
  cookie: "mail-sidebar-width",
  // The shared sidebar component sizes itself from this variable.
  cssVar: "--sidebar-width",
  defaultWidth: 236,
  minWidth: 180,
  maxWidth: 440,
};

/**
 * Width of the icon-only rail the sidebar collapses to. Wide enough that the
 * mac desktop traffic lights stay clear of the thread list beside it.
 */
export const MAIL_SIDEBAR_RAIL_WIDTH = 72;

/** The thread list beside the reader in split layout. */
export const MAIL_LIST_WIDTH: PanelWidthConfig = {
  cookie: "mail-list-width",
  cssVar: "--mail-list-width",
  defaultWidth: 400,
  minWidth: 280,
  maxWidth: 720,
};
