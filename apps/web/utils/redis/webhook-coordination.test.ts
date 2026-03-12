import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  acquireWebhookAccountLease,
  releaseWebhookAccountLease,
  setPendingWebhookHistoryId,
  getPendingWebhookHistoryId,
  clearPendingWebhookHistoryId,
} from "@/utils/redis/webhook-coordination";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "lease-token-uuid"),
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    del: vi.fn(),
    eval: vi.fn(),
  },
}));

describe("webhook-coordination redis primitives", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("acquireWebhookAccountLease", () => {
    it("returns token when lease is acquired", async () => {
      vi.mocked(redis.set).mockResolvedValue("OK");

      const token = await acquireWebhookAccountLease("account-1");

      expect(token).toBe("lease-token-uuid");
      expect(redis.set).toHaveBeenCalledWith(
        "webhook:account-lease:account-1",
        "lease-token-uuid",
        { ex: 300, nx: true },
      );
    });

    it("returns null when lease is already held", async () => {
      vi.mocked(redis.set).mockResolvedValue(null);

      const token = await acquireWebhookAccountLease("account-1");

      expect(token).toBeNull();
    });
  });

  describe("releaseWebhookAccountLease", () => {
    it("releases lease when token matches", async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      const released = await releaseWebhookAccountLease(
        "account-1",
        "my-token",
      );

      expect(released).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("DEL"'),
        ["webhook:account-lease:account-1"],
        ["my-token"],
      );
    });

    it("does not release lease when token does not match", async () => {
      vi.mocked(redis.eval).mockResolvedValue(0);

      const released = await releaseWebhookAccountLease(
        "account-1",
        "wrong-token",
      );

      expect(released).toBe(false);
    });
  });

  describe("setPendingWebhookHistoryId", () => {
    it("sets history ID when higher than current", async () => {
      vi.mocked(redis.eval).mockResolvedValue(1);

      const updated = await setPendingWebhookHistoryId("account-1", 5000);

      expect(updated).toBe(true);
      expect(redis.eval).toHaveBeenCalledWith(
        expect.stringContaining("tonumber(ARGV[1]) > tonumber(current)"),
        ["webhook:pending-history:account-1"],
        ["5000", "3600"],
      );
    });

    it("does not set history ID when lower than current", async () => {
      vi.mocked(redis.eval).mockResolvedValue(0);

      const updated = await setPendingWebhookHistoryId("account-1", 1000);

      expect(updated).toBe(false);
    });
  });

  describe("getPendingWebhookHistoryId", () => {
    it("returns parsed history ID", async () => {
      vi.mocked(redis.get).mockResolvedValue("5000");

      const historyId = await getPendingWebhookHistoryId("account-1");

      expect(historyId).toBe(5000);
      expect(redis.get).toHaveBeenCalledWith(
        "webhook:pending-history:account-1",
      );
    });

    it("returns null when no pending history", async () => {
      vi.mocked(redis.get).mockResolvedValue(null);

      const historyId = await getPendingWebhookHistoryId("account-1");

      expect(historyId).toBeNull();
    });
  });

  describe("clearPendingWebhookHistoryId", () => {
    it("deletes the pending history key", async () => {
      await clearPendingWebhookHistoryId("account-1");

      expect(redis.del).toHaveBeenCalledWith(
        "webhook:pending-history:account-1",
      );
    });
  });
});
