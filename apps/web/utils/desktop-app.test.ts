import { describe, expect, it } from "vitest";
import {
  DESKTOP_WEB_UPDATE_CHECK_INTERVAL_MS,
  DESKTOP_WEB_UPDATE_PROMPT_COOLDOWN_MS,
  shouldCheckForDesktopWebUpdate,
  shouldPromptDesktopWebUpdate,
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

  it("checks when the previous timestamp is ahead of the current clock", () => {
    expect(
      shouldCheckForDesktopWebUpdate({
        isDesktopApp: true,
        isOnline: true,
        isVisible: true,
        lastCheckedAt: now + 1,
        now,
      }),
    ).toBe(true);
  });
});

describe("shouldPromptDesktopWebUpdate", () => {
  const now = 1_000_000;

  it("prompts once when a waiting worker is ready in the desktop app", () => {
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: true,
        hasController: true,
        hasWaitingWorker: true,
        lastPromptedAt: null,
        now,
      }),
    ).toBe(true);
  });

  it("does not prompt in a browser, on first install, or without a waiting worker", () => {
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: false,
        hasController: true,
        hasWaitingWorker: true,
        lastPromptedAt: null,
        now,
      }),
    ).toBe(false);
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: true,
        hasController: false,
        hasWaitingWorker: true,
        lastPromptedAt: null,
        now,
      }),
    ).toBe(false);
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: true,
        hasController: true,
        hasWaitingWorker: false,
        lastPromptedAt: null,
        now,
      }),
    ).toBe(false);
  });

  it("does not prompt again until the cooldown has elapsed", () => {
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: true,
        hasController: true,
        hasWaitingWorker: true,
        lastPromptedAt: now - DESKTOP_WEB_UPDATE_PROMPT_COOLDOWN_MS + 1,
        now,
      }),
    ).toBe(false);
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: true,
        hasController: true,
        hasWaitingWorker: true,
        lastPromptedAt: now - DESKTOP_WEB_UPDATE_PROMPT_COOLDOWN_MS,
        now,
      }),
    ).toBe(true);
  });

  it("prompts when the previous timestamp is ahead of the current clock", () => {
    expect(
      shouldPromptDesktopWebUpdate({
        isDesktopApp: true,
        hasController: true,
        hasWaitingWorker: true,
        lastPromptedAt: now + 1,
        now,
      }),
    ).toBe(true);
  });
});
