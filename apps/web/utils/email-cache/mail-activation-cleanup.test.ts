// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache, clearEmailCacheForAccount } from "./database";
import { activateMailSync, isMailSyncActivated } from "./mail-activation";

describe("mail activation cleanup", () => {
  beforeEach(clearEmailCache);

  it("revokes only the removed account's activation before async cleanup", async () => {
    activateMailSync("account-1");
    activateMailSync("account-2");
    const clearing = clearEmailCacheForAccount("account-1");
    expect(isMailSyncActivated("account-1")).toBe(false);
    expect(isMailSyncActivated("account-2")).toBe(true);
    await clearing;
  });

  it("revokes all activation before async logout cleanup", async () => {
    activateMailSync("account-1");
    activateMailSync("account-2");
    const clearing = clearEmailCache();
    expect(isMailSyncActivated("account-1")).toBe(false);
    expect(isMailSyncActivated("account-2")).toBe(false);
    await clearing;
  });
});
