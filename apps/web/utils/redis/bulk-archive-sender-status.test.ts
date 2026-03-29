import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  getBulkArchiveSenderStatuses,
  saveCompletedBulkArchiveSenderStatus,
  saveQueuedBulkArchiveSenderStatuses,
} from "@/utils/redis/bulk-archive-sender-status";

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("bulk archive sender status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores queued sender statuses by normalized sender", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    await saveQueuedBulkArchiveSenderStatuses({
      emailAccountId: "account-1",
      senders: [" Sender@Example.com "],
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-sender-status:account-1",
      {
        "sender@example.com": {
          status: "completed",
          queued: true,
        },
      },
      { ex: 300 },
    );
  });

  it("stores completed sender statuses with archived counts", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      "sender@example.com": {
        status: "completed",
        queued: true,
      },
    });

    await saveCompletedBulkArchiveSenderStatus({
      emailAccountId: "account-1",
      sender: "sender@example.com",
      archivedCount: 12,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-sender-status:account-1",
      {
        "sender@example.com": {
          status: "completed",
          queued: false,
          archivedCount: 12,
        },
      },
      { ex: 300 },
    );
  });

  it("returns an empty object for invalid stored state", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce("invalid");

    const statuses = await getBulkArchiveSenderStatuses("account-1");

    expect(statuses).toEqual({});
  });
});
