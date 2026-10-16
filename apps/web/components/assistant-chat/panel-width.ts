import type { PanelWidthConfig } from "@/utils/panel-width";

/** The assistant chat panel docked on the right of every app page. */
export const CHAT_PANEL_WIDTH: PanelWidthConfig = {
  cookie: "chat-panel-width",
  cssVar: "--chat-panel-width",
  defaultWidth: 450,
  minWidth: 360,
  maxWidth: 800,
};
