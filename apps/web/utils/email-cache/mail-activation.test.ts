// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  activateMailSync,
  clearMailActivation,
  isMailSyncActivated,
  subscribeToMailActivation,
  setMailSyncEnabled,
} from "./mail-activation";

describe("device-local mail activation", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("defaults to inactive and persists only the visited account", () => {
    expect(isMailSyncActivated("account-1")).toBe(false);
    activateMailSync("account-1");
    expect(isMailSyncActivated("account-1")).toBe(true);
    expect(isMailSyncActivated("account-2")).toBe(false);
  });

  it("keeps explicitly disabled sync off on later Mail visits until enabled", () => {
    activateMailSync("account-1");
    activateMailSync("account-2");
    setMailSyncEnabled("account-1", false);
    activateMailSync("account-1");
    expect(isMailSyncActivated("account-1")).toBe(false);
    expect(isMailSyncActivated("account-2")).toBe(true);
    setMailSyncEnabled("account-1", true);
    expect(isMailSyncActivated("account-1")).toBe(true);
  });

  it("reports an unsaved explicit preference instead of claiming it changed", () => {
    activateMailSync("account-1");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(() => setMailSyncEnabled("account-1", false)).toThrow(
      "Storage unavailable",
    );
    expect(isMailSyncActivated("account-1")).toBe(true);
  });

  it("does not overwrite another account's activation", () => {
    activateMailSync("account-1");
    activateMailSync("account-2");
    clearMailActivation("account-1");
    expect(isMailSyncActivated("account-1")).toBe(false);
    expect(isMailSyncActivated("account-2")).toBe(true);
  });

  it("clears all activation without touching unrelated preferences", () => {
    localStorage.setItem("theme", "dark");
    activateMailSync("account-1");
    activateMailSync("account-2");
    clearMailActivation();
    expect(isMailSyncActivated("account-1")).toBe(false);
    expect(isMailSyncActivated("account-2")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("notifies this window when activation changes and removes subscriptions", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMailActivation(listener);
    activateMailSync("account-1");
    activateMailSync("account-1");
    expect(listener).toHaveBeenCalledTimes(1);
    clearMailActivation("account-1");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
    activateMailSync("account-2");
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("observes another window's activation and storage clearing", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMailActivation(listener);
    activateMailSync("account-1");
    const key = localStorage.key(0)!;
    listener.mockClear();
    localStorage.removeItem(key);
    window.dispatchEvent(
      new StorageEvent("storage", { key, storageArea: localStorage }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
    expect(isMailSyncActivated("account-1")).toBe(false);
    window.dispatchEvent(
      new StorageEvent("storage", { key: null, storageArea: localStorage }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
    window.dispatchEvent(
      new StorageEvent("storage", { key: "theme", storageArea: localStorage }),
    );
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("keeps background downloads disabled when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(() => activateMailSync("account-1")).not.toThrow();
    expect(isMailSyncActivated("account-1")).toBe(false);
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Storage unavailable");
    });
    expect(isMailSyncActivated("account-1")).toBe(false);
  });
});
