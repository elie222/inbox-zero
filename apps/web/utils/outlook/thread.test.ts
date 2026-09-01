import { describe, expect, it, vi } from "vitest";
import { getThread, getThreadsWithNextPageToken } from "@/utils/outlook/thread";
import type { OutlookClient } from "@/utils/outlook/client";
import { createTestLogger } from "@/__tests__/helpers";

describe("getThread", () => {
  it("returns messages in chronological order", async () => {
    const api = vi.fn().mockReturnValue(
      createMessagesRequest([
        { id: "newest", receivedDateTime: "2026-01-03T00:00:00.000Z" },
        { id: "oldest", receivedDateTime: "2026-01-01T00:00:00.000Z" },
        { id: "middle", receivedDateTime: "2026-01-02T00:00:00.000Z" },
      ]),
    );

    const messages = await getThread(
      "thread-1",
      createOutlookClient(api),
      createTestLogger(),
    );

    expect(messages.map((message) => message.id)).toEqual([
      "oldest",
      "middle",
      "newest",
    ]);
  });
});

describe("getThreadsWithNextPageToken", () => {
  it("does not use opaque page tokens as Graph paths", async () => {
    const api = vi.fn().mockReturnValue(createMessagesRequest());

    await getThreadsWithNextPageToken({
      client: createOutlookClient(api),
      pageToken: "opaque-token",
      logger: createTestLogger(),
    });

    expect(api).toHaveBeenCalledWith("/me/messages");
  });

  it("rejects page tokens with embedded URLs before calling Graph", async () => {
    const api = vi.fn().mockReturnValue(createMessagesRequest());

    await expect(
      getThreadsWithNextPageToken({
        client: createOutlookClient(api),
        pageToken: "prefix-https://169.254.169.254/latest",
        logger: createTestLogger(),
      }),
    ).rejects.toThrow("Invalid Outlook page token");

    expect(api).not.toHaveBeenCalled();
  });
});

function createOutlookClient(api: ReturnType<typeof vi.fn>) {
  return {
    getClient: () => ({ api }),
  } as unknown as OutlookClient;
}

function createMessagesRequest(
  messages: Array<{ id: string; receivedDateTime: string }> = [],
) {
  const request = {
    top: vi.fn(() => request),
    select: vi.fn(() => request),
    expand: vi.fn(() => request),
    filter: vi.fn(() => request),
    get: vi.fn().mockResolvedValue({ value: messages }),
  };
  return request;
}
