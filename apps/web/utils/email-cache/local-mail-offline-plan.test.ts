import { beforeEach, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { captureLocalMailCacheContext } from "./local-mail-cache-context";
import { isEmailCacheEpochCurrent } from "./database";
import { prepareLocalMailOfflineConversation } from "./local-mail-offline-plan";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));
vi.mock("./local-mail-cache-context", () => ({
  captureLocalMailCacheContext: vi.fn(),
}));
vi.mock("./database", () => ({ isEmailCacheEpochCurrent: vi.fn() }));
vi.mock("./thread-invalidation", () => ({
  getThreadCacheVersion: () => "version",
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(captureLocalMailCacheContext).mockResolvedValue({
    generation: "generation",
    epoch: {},
  } as never);
  vi.mocked(isEmailCacheEpochCurrent).mockReturnValue(true);
});

it("prepares complete account-scoped mail and counts inline duplicates once", async () => {
  vi.mocked(fetchWithAccount).mockResolvedValue(
    Response.json({
      thread: {
        id: "thread/id",
        messages: [
          {
            id: "message",
            threadId: "thread/id",
            attachments: [
              { attachmentId: "image", size: 42 },
              { attachmentId: "unknown", size: 0 },
            ],
            inline: [{ attachmentId: "image", size: 42 }],
          },
        ],
      },
    }),
  );
  const plan = await prepareLocalMailOfflineConversation({
    emailAccountId: "account",
    threadId: "thread/id",
  });
  expect(plan).toMatchObject({
    messageCount: 1,
    attachmentCount: 2,
    knownAttachmentBytes: 42,
    unknownSizeCount: 1,
  });
  expect(fetchWithAccount).toHaveBeenCalledWith(
    expect.objectContaining({
      emailAccountId: "account",
      url: "/api/threads/thread%2Fid?complete=true&includeDrafts=true",
    }),
  );
});

it("does not fetch before local mail has a durable account generation", async () => {
  vi.mocked(captureLocalMailCacheContext).mockResolvedValue(undefined);
  await expect(
    prepareLocalMailOfflineConversation({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).rejects.toThrow("still preparing");
  expect(fetchWithAccount).not.toHaveBeenCalled();
});

it("rejects a completed response after account cleanup", async () => {
  vi.mocked(fetchWithAccount).mockResolvedValue(
    Response.json({ thread: { id: "thread", messages: [] } }),
  );
  vi.mocked(isEmailCacheEpochCurrent).mockReturnValue(false);
  await expect(
    prepareLocalMailOfflineConversation({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).rejects.toThrow("changed");
});

it("aborts an oversized inventory without waiting for response completion", async () => {
  const cancel = vi.fn();
  vi.mocked(fetchWithAccount).mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new Uint8Array(32 * 1024 * 1024 + 1));
        },
        cancel,
      }),
    ),
  );
  await expect(
    prepareLocalMailOfflineConversation({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).rejects.toThrow("byte limit");
  await expect.poll(() => cancel.mock.calls.length).toBe(1);
});

it("does not accept another conversation as a complete inventory", async () => {
  vi.mocked(fetchWithAccount).mockResolvedValue(
    Response.json({
      thread: { id: "other", messages: [{ id: "message", threadId: "other" }] },
    }),
  );
  await expect(
    prepareLocalMailOfflineConversation({
      emailAccountId: "account",
      threadId: "thread",
    }),
  ).rejects.toThrow("unavailable");
});
