import { describe, it, expect, vi, beforeEach } from "vitest";
import { coordinateWebhook, drainWebhookHistory } from "./webhook-coordinator";
import { processHistoryForUser } from "@/app/api/google/webhook/process-history";
import {
  acquireWebhookAccountLease,
  getPendingWebhookHistoryId,
  releaseWebhookAccountLease,
  setPendingWebhookHistoryId,
} from "@/utils/redis/webhook-coordination";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("test");
vi.spyOn(logger, "with").mockReturnValue(logger);

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/app/api/google/webhook/process-history", () => ({
  processHistoryForUser: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("@/utils/redis/webhook-coordination", () => ({
  setPendingWebhookHistoryId: vi.fn().mockResolvedValue(true),
  acquireWebhookAccountLease: vi.fn().mockResolvedValue("lease-token"),
  releaseWebhookAccountLease: vi.fn().mockResolvedValue(true),
  getPendingWebhookHistoryId: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/utils/webhook/error-handler", () => ({
  handleWebhookError: vi.fn(),
}));

describe("coordinateWebhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns no-account when email account not found", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(null);

    const result = await coordinateWebhook({
      email: "unknown@test.com",
      historyId: 1000,
      logger,
    });

    expect(result.status).toBe("no-account");
    expect(setPendingWebhookHistoryId).not.toHaveBeenCalled();
  });

  it("returns coordination-failed when setPendingWebhookHistoryId throws", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "account-1",
    } as any);
    vi.mocked(setPendingWebhookHistoryId).mockRejectedValueOnce(
      new Error("Redis down"),
    );

    const result = await coordinateWebhook({
      email: "user@test.com",
      historyId: 1000,
      logger,
    });

    expect(result.status).toBe("coordination-failed");
  });

  it("returns coordination-failed when acquireWebhookAccountLease throws", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "account-1",
    } as any);
    vi.mocked(acquireWebhookAccountLease).mockRejectedValueOnce(
      new Error("Redis down"),
    );

    const result = await coordinateWebhook({
      email: "user@test.com",
      historyId: 1000,
      logger,
    });

    expect(result.status).toBe("coordination-failed");
  });

  it("returns lease-contention when lease is already held", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "account-1",
    } as any);
    vi.mocked(acquireWebhookAccountLease).mockResolvedValueOnce(null);

    const result = await coordinateWebhook({
      email: "user@test.com",
      historyId: 1000,
      logger,
    });

    expect(result.status).toBe("lease-contention");
    expect(setPendingWebhookHistoryId).toHaveBeenCalledWith("account-1", 1000);
    expect(processHistoryForUser).not.toHaveBeenCalled();
  });

  it("acquires lease, processes, and releases on success", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "account-1",
    } as any);

    const result = await coordinateWebhook({
      email: "user@test.com",
      historyId: 1000,
      logger,
    });

    expect(result.status).toBe("processed");
    expect(setPendingWebhookHistoryId).toHaveBeenCalledWith("account-1", 1000);
    expect(acquireWebhookAccountLease).toHaveBeenCalledWith("account-1");
    expect(processHistoryForUser).toHaveBeenCalledWith(
      { emailAddress: "user@test.com", historyId: 1000 },
      {},
      logger,
    );
    expect(releaseWebhookAccountLease).toHaveBeenCalledWith(
      "account-1",
      "lease-token",
    );
  });

  it("releases lease even when processing throws", async () => {
    vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
      id: "account-1",
    } as any);
    vi.mocked(processHistoryForUser).mockRejectedValueOnce(
      new Error("Processing failed"),
    );

    const result = await coordinateWebhook({
      email: "user@test.com",
      historyId: 1000,
      logger,
    });

    expect(result.status).toBe("processed");
    expect(releaseWebhookAccountLease).toHaveBeenCalledWith(
      "account-1",
      "lease-token",
    );
  });
});

describe("drainWebhookHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes single iteration when no newer pending history exists", async () => {
    vi.mocked(getPendingWebhookHistoryId).mockResolvedValue(null);

    await drainWebhookHistory({
      emailAccountId: "account-1",
      email: "user@test.com",
      initialHistoryId: 1000,
      logger,
    });

    expect(processHistoryForUser).toHaveBeenCalledTimes(1);
    expect(processHistoryForUser).toHaveBeenCalledWith(
      { emailAddress: "user@test.com", historyId: 1000 },
      {},
      logger,
    );
  });

  it("drains newer pending history IDs before stopping", async () => {
    vi.mocked(getPendingWebhookHistoryId)
      .mockResolvedValueOnce(2000)
      .mockResolvedValueOnce(3000)
      .mockResolvedValueOnce(3000);

    await drainWebhookHistory({
      emailAccountId: "account-1",
      email: "user@test.com",
      initialHistoryId: 1000,
      logger,
    });

    expect(processHistoryForUser).toHaveBeenCalledTimes(3);
    expect(processHistoryForUser).toHaveBeenNthCalledWith(
      1,
      { emailAddress: "user@test.com", historyId: 1000 },
      {},
      logger,
    );
    expect(processHistoryForUser).toHaveBeenNthCalledWith(
      2,
      { emailAddress: "user@test.com", historyId: 2000 },
      {},
      logger,
    );
    expect(processHistoryForUser).toHaveBeenNthCalledWith(
      3,
      { emailAddress: "user@test.com", historyId: 3000 },
      {},
      logger,
    );
  });

  it("stops draining when pending history ID is not newer", async () => {
    vi.mocked(getPendingWebhookHistoryId).mockResolvedValue(1000);

    await drainWebhookHistory({
      emailAccountId: "account-1",
      email: "user@test.com",
      initialHistoryId: 1000,
      logger,
    });

    expect(processHistoryForUser).toHaveBeenCalledTimes(1);
  });

  it("stops on processing error and does not continue draining", async () => {
    vi.mocked(processHistoryForUser).mockRejectedValueOnce(
      new Error("Gmail API error"),
    );
    vi.mocked(getPendingWebhookHistoryId).mockResolvedValue(2000);

    await drainWebhookHistory({
      emailAccountId: "account-1",
      email: "user@test.com",
      initialHistoryId: 1000,
      logger,
    });

    expect(processHistoryForUser).toHaveBeenCalledTimes(1);
  });

  it("continues draining when getPendingWebhookHistoryId fails", async () => {
    vi.mocked(getPendingWebhookHistoryId).mockRejectedValueOnce(
      new Error("Redis error"),
    );

    await drainWebhookHistory({
      emailAccountId: "account-1",
      email: "user@test.com",
      initialHistoryId: 1000,
      logger,
    });

    expect(processHistoryForUser).toHaveBeenCalledTimes(1);
  });
});
