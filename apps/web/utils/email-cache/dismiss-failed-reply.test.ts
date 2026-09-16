// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, expect, it } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  enqueueMailMutation,
  getMailMutation,
  failMailMutation,
  dismissFailedReply,
} from "./mail-mutations";

beforeEach(clearEmailCache);

it("dismisses only the selected failed reply without changing another attempt", async () => {
  await enqueueReply("failed");
  await enqueueReply("another");
  await failMailMutation("failed", "failed", "Draft unavailable");
  expect(await dismissFailedReply("failed", "account")).toBe(true);
  expect(await getMailMutation("failed")).toBeUndefined();
  expect(await getMailMutation("another")).toBeDefined();
});

it.each([
  "pending",
  "processing",
  "retry_wait",
  "uncertain",
  "succeeded",
] as const)("does not dismiss a reply whose status is %s", async (status) => {
  await enqueueReply("reply");
  const db = await getEmailCacheDatabase();
  const row = await db!.get("mailMutations", "reply");
  await db!.put("mailMutations", { ...row!, status });
  expect(await dismissFailedReply("reply", "account")).toBe(false);
  expect(await getMailMutation("reply")).toBeDefined();
});

it("does not dismiss another account's reply or a leased operation", async () => {
  await enqueueReply("reply");
  await failMailMutation("reply", "failed", "Draft unavailable");
  expect(await dismissFailedReply("reply", "other-account")).toBe(false);
  const db = await getEmailCacheDatabase();
  const row = await db!.get("mailMutations", "reply");
  await db!.put("mailMutations", { ...row!, leaseOwner: "worker" });
  expect(await dismissFailedReply("reply", "account")).toBe(false);
  expect(await getMailMutation("reply")).toBeDefined();
});

function enqueueReply(id: string) {
  return enqueueMailMutation({
    id,
    emailAccountId: "account",
    threadId: "thread",
    messageIds: ["parent"],
    kind: "reply",
    email: {
      to: "recipient@example.com",
      subject: "Example",
      messageHtml: "<p>Reply</p>",
    },
  });
}
