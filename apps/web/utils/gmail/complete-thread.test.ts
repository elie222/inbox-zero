import { Readable } from "node:stream";
import { expect, it, vi } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import { getCompleteGmailThread } from "./thread";
it("reads the entire provider conversation through the bounded stream path", async () => {
  const messages = Array.from({ length: 101 }, (_, i) => ({
    id: String(i),
    threadId: "thread",
    payload: { body: { data: "body" } },
  }));
  const get = vi.fn().mockResolvedValue({
    data: Readable.from([
      Buffer.from(JSON.stringify({ id: "thread", messages })),
    ]),
  });
  const gmail = { users: { threads: { get } } } as unknown as gmail_v1.Gmail;
  expect((await getCompleteGmailThread("thread", gmail)).messages).toHaveLength(
    101,
  );
  expect(get).toHaveBeenCalledWith(
    { userId: "me", id: "thread", format: "full" },
    { responseType: "stream", signal: undefined },
  );
});
it.each([
  { id: "other", messages: [] },
  { id: "thread" },
  { id: "thread", messages: [{ id: "a", threadId: "other" }] },
  {
    id: "thread",
    messages: Array.from({ length: 1001 }, (_, i) => ({
      id: String(i),
      threadId: "thread",
    })),
  },
])("rejects an incomplete, mismatched, or oversized snapshot", async (data) => {
  const gmail = {
    users: {
      threads: {
        get: vi.fn().mockResolvedValue({
          data: Readable.from([Buffer.from(JSON.stringify(data))]),
        }),
      },
    },
  } as unknown as gmail_v1.Gmail;
  await expect(getCompleteGmailThread("thread", gmail)).rejects.toThrow();
});
