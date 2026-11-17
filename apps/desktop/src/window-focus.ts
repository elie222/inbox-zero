import type { BaseWindow, WebContents } from "electron";

export function installDesktopWindowFocus(
  window: BaseWindow,
  getActiveContents: () => WebContents,
) {
  window.on("focus", focusView);
  focusView();

  function focusView() {
    const contents = getActiveContents();
    // On macOS contents.focus() also raises its owner window. A stale focus
    // event must not pull a background window back over the active one.
    if (
      window.isDestroyed() ||
      !window.isFocused() ||
      contents.isDestroyed() ||
      contents.isFocused()
    )
      return;
    contents.focus();
  }
}
