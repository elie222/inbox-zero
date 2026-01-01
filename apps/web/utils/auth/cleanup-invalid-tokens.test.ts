import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { cleanupInvalidTokens } from "./cleanup-invalid-tokens";
import { sendReconnectionEmail } from "@inboxzero/resend";
import { createScopedLogger } from "@/utils/logger";
import { addUserErrorMessage } from "@/utils/error-messages";

vi.mock("@/utils/prisma");
vi.mock("@inboxzero/resend", () => ({
  sendReconnectionEmail: vi.fn(),
}));
vi.mock("@/utils/error-messages", () => ({
  addUserErrorMessage: vi.fn().mockResolvedValue(undefined),
  ErrorType: {
    ACCOUNT_DISCONNECTED: "Account disconnected",
  },
}));
vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: vi.fn().mockResolvedValue("mock-token"),
}));

describe("cleanupInvalidTokens", () => {
  const logger = createScopedLogger("test");

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEmailAccount = {
    id: "ea_1",
    email: "test@example.com",
    accountId: "acc_1",
    userId: "user_1",
    account: { disconnectedAt: null },
    watchEmailsExpirationDate: new Date(Date.now() + 1000 * 60 * 60), // Valid expiration
  };

  it("marks account as disconnected and sends email on invalid_grant when account is watched", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(mockEmailAccount as any);

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "acc_1" },
        data: expect.objectContaining({
          disconnectedAt: expect.any(Date),
        }),
      }),
    );
    expect(sendReconnectionEmail).toHaveBeenCalled();
    expect(addUserErrorMessage).toHaveBeenCalledWith(
      "user_1",
      "Account disconnected",
      expect.stringContaining("test@example.com"),
    );
  });

  it("marks as disconnected but skips email if account is not watched", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...mockEmailAccount,
      watchEmailsExpirationDate: null,
    } as any);

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.update).toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessage).toHaveBeenCalledWith(
      "user_1",
      "Account disconnected",
      expect.stringContaining("test@example.com"),
    );
  });

  it("returns early if account is already disconnected", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...mockEmailAccount,
      account: { disconnectedAt: new Date() },
    } as any);

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.update).not.toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
  });

  it("does not send email for insufficient_permissions", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(mockEmailAccount as any);

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      reason: "insufficient_permissions",
      logger,
    });

    expect(prisma.account.update).toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessage).not.toHaveBeenCalled();
  });
});
