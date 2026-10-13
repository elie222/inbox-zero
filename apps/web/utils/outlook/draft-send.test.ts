import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import type { OutlookClient } from "@/utils/outlook/client";
import { sendDraft } from "@/utils/outlook/draft";

describe("Outlook sendDraft", () => {
  it.each([
    Object.assign(new Error("Message not found"), {
      statusCode: 404,
      code: "ErrorItemNotFound",
    }),
    Object.assign(new Error("Access denied"), {
      statusCode: 403,
      code: "ErrorAccessDenied",
    }),
    new Error("Metadata read unavailable"),
  ])("returns the known IDs when sent-message reads fail with %j", async (error) => {
    const post = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn(async () => {
      if (post.mock.calls.length) throw error;
      return { id: "draft-1", conversationId: "thread-1" };
    });
    const client = createClient({ get, post });

    await expect(
      sendDraft({ client, draftId: "draft-1", logger: createTestLogger() }),
    ).resolves.toEqual({ messageId: "draft-1", threadId: "thread-1" });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("propagates a rejected send without retrying it", async () => {
    const error = Object.assign(new Error("Send unavailable"), {
      statusCode: 503,
      code: "ServiceNotAvailable",
    });
    const post = vi.fn().mockRejectedValue(error);
    const get = vi.fn().mockResolvedValue({ conversationId: "thread-1" });

    await expect(
      sendDraft({
        client: createClient({ get, post }),
        draftId: "draft-1",
        logger: createTestLogger(),
      }),
    ).rejects.toEqual(error);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("does not send when the draft conversation ID is missing", async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockResolvedValue({ id: "draft-1" });

    await expect(
      sendDraft({
        client: createClient({ get, post }),
        draftId: "draft-1",
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("threadId");
    expect(post).not.toHaveBeenCalled();
  });

  it("does not send when the draft metadata read fails", async () => {
    const error = Object.assign(new Error("Message not found"), {
      statusCode: 404,
      code: "ErrorItemNotFound",
    });
    const post = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn().mockRejectedValue(error);

    await expect(
      sendDraft({
        client: createClient({ get, post }),
        draftId: "draft-1",
        logger: createTestLogger(),
      }),
    ).rejects.toEqual(error);
    expect(post).not.toHaveBeenCalled();
  });
});

function createClient({
  get,
  post,
}: {
  get: () => Promise<unknown>;
  post: () => Promise<unknown>;
}) {
  return {
    getClient: () => ({
      api: (path: string) => {
        if (path === "/me/messages/draft-1/send") return { post };
        if (path === "/me/messages/draft-1") {
          return { get, select: vi.fn().mockReturnValue({ get }) };
        }
        throw new Error(`Unexpected Graph path: ${path}`);
      },
    }),
  } as unknown as OutlookClient;
}
