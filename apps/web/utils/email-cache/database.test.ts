import "fake-indexeddb/auto";
import { openDB } from "idb";
import { describe, expect, it } from "vitest";
import { getEmailCacheDatabase } from "./database";

describe("email cache upgrade", () => {
  it("drops old conversation details while preserving unsent work", async () => {
    const previous = await openDB("inbox-zero-email-cache", 8, {
      upgrade(database) {
        database.createObjectStore("threadDetails");
        database.createObjectStore("replyDrafts");
        database.createObjectStore("mailMutations");
      },
    });
    await previous.put("threadDetails", { stale: true }, "thread-1");
    await previous.put("replyDrafts", { content: "local draft" }, "draft-1");
    await previous.put("mailMutations", { status: "pending" }, "send-1");
    previous.close();

    const database = await getEmailCacheDatabase();
    expect(await database?.count("threadDetails")).toBe(0);
    expect(await database?.count("replyDrafts")).toBe(1);
    expect(await database?.count("mailMutations")).toBe(1);
    database?.close();
  });
});
