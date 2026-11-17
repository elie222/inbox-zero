import type { BaseWindow, WebContents } from "electron";

export function installDesktopWindowFocus(
  window: BaseWindow,
  getActiveContents: () => WebContents,
  onFocus?: () => void,
) {
  window.on("focus", focusView);
  focusView();

  function focusView() {
    // On macOS contents.focus() also raises its owner window. A stale focus
    // event must not change the active window or pull a background view forward.
    if (window.isDestroyed() || !window.isFocused()) return;
    onFocus?.();
    const contents = getActiveContents();
    if (contents.isDestroyed() || contents.isFocused()) return;
    contents.focus();
  }
}
