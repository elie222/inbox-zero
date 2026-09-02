import { describe, expect, it } from "vitest";
import {
  DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS,
  shouldCheckForDesktopWebUpdate,
} from "./desktop-app";

describe("shouldCheckForDesktopWebUpdate", () => {
  const now = 1_000_000;

  it("checks when the desktop app is first visible", () => {
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: true,
        isOnline: true,
        isVisible: true,
        lastCheckedAt: null,
        now,
      }),
    ).toBe(true);
  });

  it("does not check in a browser or while the app is hidden", () => {
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: false,
        isOnline: true,
        isVisible: true,
        lastCheckedAt: null,
        now,
      }),
    ).toBe(false);
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: true,
        isOnline: true,
        isVisible: false,
        lastCheckedAt: null,
        now,
      }),
    ).toBe(false);
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: true,
        isOnline: false,
        isVisible: true,
        lastCheckedAt: null,
        now,
      }),
    ).toBe(false);
  });

  it("checks again only after the interval has elapsed", () => {
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: true,
        isOnline: true,
        isVisible: true,
        lastCheckedAt: now - DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS + 1,
        now,
      }),
    ).toBe(false);
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: true,
        isOnline: true,
        isVisible: true,
        lastCheckedAt: now - DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS,
        now,
      }),
    ).toBe(true);
  });
});
