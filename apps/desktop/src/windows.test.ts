import { describe, expect, it } from "vitest";
import {
  collectDesktopWindowStates,
  fitWindowBoundsToWorkArea,
  getDesktopUnreadBadgeCount,
  getLegacyDesktopWindowStates,
  getRestoredDesktopWindows,
  MAX_DESKTOP_WINDOWS,
  offsetWindowBounds,
  parseDesktopWindowStates,
  shouldReuseSoleHiddenWindow,
} from "./windows";

const origin = "https://www.getinboxzero.com";
const mailBounds = {
  x: 120,
  y: 80,
  width: 1280,
  height: 840,
};
const mailWindow = {
  url: `${origin}/account-1/mail?type=inbox`,
  bounds: mailBounds,
  isMaximized: false,
};

describe("desktop window state", () => {
  it("keeps valid mail windows and drops malformed or foreign URLs", () => {
    expect(
      parseDesktopWindowStates(
        [
          mailWindow,
          { url: `${origin}/login`, bounds: mailBounds, isMaximized: false },
          { url: "https://evil.test/account-1/mail", bounds: mailBounds },
          {
            url: `${origin}/account-2/mail`,
            bounds: { x: 40, y: 40, width: 100, height: 80 },
          },
          null,
        ],
        origin,
      ),
    ).toEqual([mailWindow]);
  });

  it("caps restored windows and sends utility pages back through a fresh launch", () => {
    const extras = Array.from({ length: MAX_DESKTOP_WINDOWS }, (_, index) => ({
      url: `${origin}/account-${index + 1}/mail`,
      bounds: mailBounds,
      isMaximized: false,
    }));
    expect(
      parseDesktopWindowStates([...extras, mailWindow], origin),
    ).toHaveLength(MAX_DESKTOP_WINDOWS);
    expect(
      getRestoredDesktopWindows(
        [
          mailWindow,
          {
            url: `${origin}/account-1/automation`,
            bounds: mailBounds,
            isMaximized: true,
          },
        ],
        origin,
      ),
    ).toEqual([mailWindow]);
  });

  it("migrates a single last mail URL and ignores a leftover login page", () => {
    expect(
      getLegacyDesktopWindowStates(`${origin}/account-1/mail`, origin),
    ).toEqual([
      {
        url: `${origin}/account-1/mail`,
        bounds: { x: 0, y: 0, width: 1280, height: 840 },
        isMaximized: false,
      },
    ]);
    expect(getLegacyDesktopWindowStates(`${origin}/login`, origin)).toEqual([]);
  });

  it("only persists in-app pages that can be restored later", () => {
    expect(
      collectDesktopWindowStates(
        [
          mailWindow,
          {
            url: `${origin}/login`,
            bounds: mailBounds,
            isMaximized: false,
          },
        ],
        origin,
      ),
    ).toEqual([mailWindow]);
  });
});

describe("desktop window placement", () => {
  it("clamps overlapping windows onto the display and recenters off-screen ones", () => {
    const workArea = { x: 0, y: 25, width: 1440, height: 900 };
    expect(
      fitWindowBoundsToWorkArea(
        { x: -80, y: 40, width: 1280, height: 840 },
        workArea,
      ),
    ).toEqual({ x: 0, y: 40, width: 1280, height: 840 });
    expect(
      fitWindowBoundsToWorkArea(
        { x: 8000, y: 8000, width: 1280, height: 840 },
        workArea,
      ),
    ).toEqual({ x: 80, y: 55, width: 1280, height: 840 });
  });

  it("offsets a new window from the focused one", () => {
    expect(offsetWindowBounds(mailBounds)).toEqual({
      x: 148,
      y: 108,
      width: 1280,
      height: 840,
    });
  });
});

describe("desktop window targeting", () => {
  it("uses the highest unread report so a closing window cannot zero the badge", () => {
    expect(getDesktopUnreadBadgeCount([0, 4, 2])).toBe(4);
    expect(getDesktopUnreadBadgeCount([])).toBe(0);
  });

  it("reuses the hidden Mac window instead of stacking a second copy", () => {
    expect(shouldReuseSoleHiddenWindow(1, 0)).toBe(true);
    expect(shouldReuseSoleHiddenWindow(1, 1)).toBe(false);
    expect(shouldReuseSoleHiddenWindow(2, 1)).toBe(false);
  });
});
