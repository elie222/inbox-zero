// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import {
  readLocalMailSettings,
  writeLocalMailSettings,
  subscribeToLocalMailSettings,
} from "./local-mail-settings";

vi.mock("@/utils/desktop-app", () => ({ getInboxZeroDesktopApp: vi.fn() }));
beforeEach(() => {
  localStorage.clear();
  vi.mocked(getInboxZeroDesktopApp).mockReturnValue(undefined);
});
afterEach(() => vi.restoreAllMocks());

it("persists one device envelope and notifies local and other-tab consumers", () => {
  const listener = vi.fn();
  const stop = subscribeToLocalMailSettings(listener);
  const settings = {
    ...readLocalMailSettings(),
    budgetBytes: 1024 * 1024 * 1024,
    pushEnabled: false,
  };
  writeLocalMailSettings(settings);
  expect(readLocalMailSettings()).toEqual(settings);
  expect(listener).toHaveBeenCalledTimes(1);
  window.dispatchEvent(
    new StorageEvent("storage", { key: "inbox-zero:local-mail-settings" }),
  );
  expect(listener).toHaveBeenCalledTimes(2);
  stop();
  writeLocalMailSettings(settings);
  expect(listener).toHaveBeenCalledTimes(2);
});

it("rejects unsafe budgets without replacing the previous setting", () => {
  const settings = readLocalMailSettings();
  writeLocalMailSettings(settings);
  for (const budgetBytes of [
    0,
    -1,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    expect(() =>
      writeLocalMailSettings({ ...settings, budgetBytes }),
    ).toThrow();
  expect(() =>
    writeLocalMailSettings({
      ...settings,
      attachmentBudgetBytes: settings.budgetBytes + 1,
    }),
  ).toThrow();
  expect(readLocalMailSettings()).toEqual(settings);
});

it("recovers malformed preferences but surfaces failed saves", () => {
  localStorage.setItem("inbox-zero:local-mail-settings", "invalid");
  expect(readLocalMailSettings().budgetBytes).toBe(500 * 1024 * 1024);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage denied");
  });
  expect(() => writeLocalMailSettings(readLocalMailSettings())).toThrow(
    "storage denied",
  );
});
