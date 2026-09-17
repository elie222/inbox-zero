import "fake-indexeddb/auto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getMockMessage } from "@/__tests__/helpers";
import { fetchWithAccount } from "@/utils/fetch";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { bootstrapLocalMailStorageLedgerBatch } from "./local-mail-storage-ledger-bootstrap";
import { prepareLocalMailOfflineConversation } from "./local-mail-offline-plan";
import { saveLocalMailOfflineConversation } from "./local-mail-offline-save";
import { readLocalMailOfflineSnapshot } from "./local-mail-attachments";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));

beforeEach(async () => {
  vi.clearAllMocks();
  await clearEmailCache();
  vi.stubGlobal("navigator", {
    storage: { estimate: async () => ({ quota: 1024 ** 3, usage: 0 }) },
    locks: {
      request: async (
        _name: string,
        _options: unknown,
        run: (lock: object) => unknown,
      ) => run({}),
    },
  });
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", {
    emailAccountId: "account",
    generation: "generation",
    messageBytes: 0,
  });
  while ((await bootstrapLocalMailStorageLedgerBatch()) === "progress") {}
  const ledger = (await db.get("localMailStorageLedger", "origin"))!;
  await db.put("localMailStorageLedger", {
    ...ledger,
    index: { status: "ready", bytes: 0 },
  });
  vi.mocked(fetchWithAccount).mockImplementation(async () =>
    Response.json({
      thread: {
        id: "thread",
        messages: [getMockMessage({ id: "message", threadId: "thread" })],
        snippet: "",
      },
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

it("persists full text and a complete text-only offline snapshot without changing history coverage", async () => {
  const plan = await prepareLocalMailOfflineConversation({
    emailAccountId: "account",
    threadId: "thread",
  });
  const snapshotId = await saveLocalMailOfflineConversation(plan);
  const db = (await getEmailCacheDatabase())!;
  expect(
    await readLocalMailOfflineSnapshot({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).toMatchObject({
    snapshotId,
    messagesReady: true,
    attachmentsReady: true,
  });
  expect(
    (await db.get("localMailMessages", ["account", "message"]))?.data.textPlain,
  ).toBe("Test content");
  expect(await db.get("localMailSyncStates", "account")).toBeUndefined();
  expect(await db.count("searchIndexWork")).toBeGreaterThan(0);
});

it("does not recreate mail or pins after account cleanup during confirmation", async () => {
  const plan = await prepareLocalMailOfflineConversation({
    emailAccountId: "account",
    threadId: "thread",
  });
  await clearEmailCacheForAccount("account");
  await expect(saveLocalMailOfflineConversation(plan)).rejects.toThrow();
  const db = (await getEmailCacheDatabase())!;
  expect(await db.count("localMailMessages")).toBe(0);
  expect(await db.count("localMailThreadProtection")).toBe(0);
});

it("rolls back the message and pin when logical capacity is unavailable", async () => {
  const plan = await prepareLocalMailOfflineConversation({
    emailAccountId: "account",
    threadId: "thread",
  });
  const db = (await getEmailCacheDatabase())!;
  const ledger = (await db.get("localMailStorageLedger", "origin"))!;
  await db.put("localMailStorageLedger", {
    ...ledger,
    index: { status: "ready", bytes: 1024 ** 3 },
  });
  await expect(saveLocalMailOfflineConversation(plan)).rejects.toThrow(
    "storage",
  );
  expect(await db.count("localMailMessages")).toBe(0);
  expect(await db.count("localMailThreadProtection")).toBe(0);
});
