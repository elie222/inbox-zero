import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  saveFailedBulkArchiveSenderStatus,
  saveProcessingBulkArchiveSenderStatus,
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
          status: "queued",
        },
      },
      { ex: 300 },
    );
  });

  it("stores processing sender statuses with the in-progress ttl", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      "sender@example.com": {
        status: "queued",
      },
    });

    await saveProcessingBulkArchiveSenderStatus({
      emailAccountId: "account-1",
      sender: "sender@example.com",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-sender-status:account-1",
      {
        "sender@example.com": {
          status: "processing",
        },
      },
      { ex: 300 },
    );
  });

  it("stores completed sender statuses with archived counts", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      "sender@example.com": {
        status: "processing",
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
          archivedCount: 12,
        },
      },
      { ex: 30 },
    );
  });

  it("stores failed sender statuses with a short ttl", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      "sender@example.com": {
        status: "processing",
      },
    });

    await saveFailedBulkArchiveSenderStatus({
      emailAccountId: "account-1",
      sender: "sender@example.com",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "bulk-archive-sender-status:account-1",
      {
        "sender@example.com": {
          status: "failed",
        },
      },
      { ex: 30 },
    );
  });

  it("normalizes legacy queued status entries when reading", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce({
      "sender@example.com": {
        status: "completed",
        queued: true,
      },
    });

    const statuses = await getBulkArchiveSenderStatuses("account-1");

    expect(statuses).toEqual({
      "sender@example.com": {
        status: "queued",
      },
    });
  });

  it("returns an empty object for invalid stored state", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce("invalid");

    const statuses = await getBulkArchiveSenderStatuses("account-1");

    expect(statuses).toEqual({});
  });
});
