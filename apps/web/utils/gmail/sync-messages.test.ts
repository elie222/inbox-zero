import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger, getMockMessage } from "@/__tests__/helpers";
import { getMessage, getMessagesBatch } from "@/utils/gmail/message";
import { getGmailSyncMessages } from "./sync-messages";

vi.mock("@/utils/gmail/message");
const logger = createTestLogger();
beforeEach(() => vi.resetAllMocks());

describe("strict sync message retrieval", () => {
  it("serializes batches and deduplicates requested ids", async () => {
    const pending =
      Promise.withResolvers<ReturnType<typeof getMockMessage>[]>();
    const first = Array.from({ length: 100 }, (_, index) =>
      getMockMessage({ id: String(index) }),
    );
    vi.mocked(getMessagesBatch)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([getMockMessage({ id: "100" })]);
    const sync = getGmailSyncMessages({
      gmail: {} as never,
      logger,
      accessToken: "test-token",
      messageIds: [...first.map(({ id }) => id), "100", "100"],
    });
    await Promise.resolve();
    expect(getMessagesBatch).toHaveBeenCalledTimes(1);
    pending.resolve(first);
    expect((await sync).messages).toHaveLength(101);
    expect(getMessagesBatch).toHaveBeenLastCalledWith(
      expect.objectContaining({ messageIds: ["100"] }),
    );
  });

  it("rejects unrequested message ids instead of writing them to the account", async () => {
    vi.mocked(getMessagesBatch).mockResolvedValue([
      getMockMessage({ id: "unexpected" }),
    ]);
    await expect(
      getGmailSyncMessages({
        gmail: {} as never,
        logger,
        accessToken: "test-token",
        messageIds: ["requested"],
      }),
    ).rejects.toThrow("unexpected sync message ID");
  });

  it("propagates throttling while recovering an omitted batch item", async () => {
    vi.mocked(getMessagesBatch).mockResolvedValue([]);
    const error = { status: 429 };
    vi.mocked(getMessage).mockRejectedValue(error);
    await expect(
      getGmailSyncMessages({
        gmail: {} as never,
        logger,
        accessToken: "test-token",
        messageIds: ["requested"],
      }),
    ).rejects.toBe(error);
  });
});
