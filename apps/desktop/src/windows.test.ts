import { describe, expect, it } from "vitest";
import {
  fitWindowBoundsToWorkArea,
  MAX_DESKTOP_WINDOWS,
  parseDesktopWindowStates,
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
  it("keeps restorable mail windows and drops everything else", () => {
    expect(
      parseDesktopWindowStates(
        [
          mailWindow,
          { url: `${origin}/login`, bounds: mailBounds },
          { url: `${origin}/account-1/automation`, bounds: mailBounds },
          { url: "https://evil.test/account-1/mail", bounds: mailBounds },
          {
            url: `${origin}/account-2/mail`,
            bounds: { x: 40, y: 40, width: 100, height: 80 },
          },
          { url: `${origin}/account-3/mail` },
          null,
        ],
        origin,
      ),
    ).toEqual([
      mailWindow,
      { url: `${origin}/account-3/mail`, isMaximized: false },
    ]);
  });

  it("caps how many windows are restored", () => {
    const extras = Array.from({ length: MAX_DESKTOP_WINDOWS }, (_, index) => ({
      url: `${origin}/account-${index + 1}/mail`,
      bounds: mailBounds,
    }));
    expect(
      parseDesktopWindowStates([...extras, mailWindow], origin),
    ).toHaveLength(MAX_DESKTOP_WINDOWS);
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
});
