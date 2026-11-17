import { EventEmitter } from "node:events";
import type { BaseWindow, WebContents } from "electron";
import { describe, expect, it, vi } from "vitest";
import { installDesktopWindowFocus } from "./window-focus";

describe("desktop window focus", () => {
  it("settles on the last restored window instead of bouncing between windows", () => {
    const events: Array<() => void> = [];
    let activeWindow = -1;
    let focusedContents = -1;
    const windows = [0, 1].map((id) => {
      const window = Object.assign(new EventEmitter(), {
        isDestroyed: () => false,
        isFocused: () => activeWindow === id,
      });
      const contents = {
        isDestroyed: () => false,
        isFocused: () => focusedContents === id,
        focus: () => {
          activeWindow = id;
          focusedContents = id;
          events.push(() => window.emit("focus"));
        },
      };
      installDesktopWindowFocus(
        window as unknown as BaseWindow,
        () => contents as unknown as WebContents,
      );
      return window;
    });

    // Native activation notifications can arrive after the next restored
    // window has already become active.
    activeWindow = 1;
    events.push(() => windows[0].emit("focus"));
    events.push(() => windows[1].emit("focus"));
    for (let count = 0; events.length && count < 20; count++)
      events.shift()?.();

    expect(events).toHaveLength(0);
    expect(activeWindow).toBe(1);
    expect(focusedContents).toBe(1);
  });

  it("ignores a stale focus event after another window became active", () => {
    const { window, contents, onFocus } = setup();
    window.emit("focus");
    expect(contents.focus).not.toHaveBeenCalled();
    expect(onFocus).not.toHaveBeenCalled();
  });

  it("does not reactivate a window whose view already has keyboard focus", () => {
    const { window, contents } = setup({
      windowFocused: true,
      contentsFocused: true,
    });
    window.emit("focus");
    expect(contents.focus).not.toHaveBeenCalled();
  });

  it("updates active-window bookkeeping even when the view already has focus", () => {
    const { window, onFocus } = setup({
      windowFocused: true,
      contentsFocused: true,
    });
    onFocus.mockClear();
    window.emit("focus");
    expect(onFocus).toHaveBeenCalledOnce();
  });

  it("hands keyboard focus to the view when the window becomes active", () => {
    const { window, contents } = setup();
    window.isFocused.mockReturnValue(true);
    window.emit("focus");
    expect(contents.focus).toHaveBeenCalledOnce();
  });

  it("hands focus to a window that was active before installation", () => {
    const { contents } = setup({ windowFocused: true });
    expect(contents.focus).toHaveBeenCalledOnce();
  });
});

function setup({ windowFocused = false, contentsFocused = false } = {}) {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => windowFocused),
  });
  const contents = {
    isDestroyed: vi.fn(() => false),
    isFocused: vi.fn(() => contentsFocused),
    focus: vi.fn(),
  };
  const onFocus = vi.fn();
  installDesktopWindowFocus(
    window as unknown as BaseWindow,
    () => contents as unknown as WebContents,
    onFocus,
  );
  return { window, contents, onFocus };
}
