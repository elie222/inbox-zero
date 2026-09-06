import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { cleanupInvalidTokens } from "./cleanup-invalid-tokens";
import { sendReconnectionEmail } from "@inboxzero/transactional-email";
import {
  addUserErrorMessage,
  addUserErrorMessageWithNotification,
} from "@/utils/error-messages";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma");
vi.mock("@inboxzero/transactional-email", () => ({
  sendReconnectionEmail: vi.fn(),
}));
vi.mock("@/utils/error-messages", () => ({
  addUserErrorMessage: vi.fn().mockResolvedValue(undefined),
  addUserErrorMessageWithNotification: vi.fn().mockResolvedValue(undefined),
  ErrorType: {
    ACCOUNT_DISCONNECTED: "Account disconnected",
  },
}));
vi.mock("@/utils/unsubscribe", () => ({
  createUnsubscribeToken: vi.fn().mockResolvedValue("mock-token"),
}));

describe("cleanupInvalidTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockEmailAccount = {
    id: "ea_1",
    email: "test@example.com",
    accountId: "acc_1",
    userId: "user_1",
    user: { email: "owner@example.com" },
    account: {
      disconnectedAt: null,
      access_token: "access-token",
      updatedAt: new Date("2026-09-05T12:00:00Z"),
    },
    watchEmailsExpirationDate: new Date(Date.now() + 1000 * 60 * 60), // Valid expiration
  };

  it("preserves reconnected credentials when an old request fails", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...mockEmailAccount,
      account: {
        disconnectedAt: null,
        access_token: "new-access",
        refresh_token: "new-refresh",
        updatedAt: new Date("2026-09-05T12:00:00Z"),
      },
    } as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      reason: "invalid_grant",
      failedAccessToken: "old-access",
      failedRefreshToken: "old-refresh",
      logger,
    });

    expect(prisma.account.updateMany).not.toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessageWithNotification).not.toHaveBeenCalled();
  });

  it("preserves credentials when no failed credential snapshot is available", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(mockEmailAccount as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      reason: "invalid_grant",
      logger,
    });
    expect(prisma.account.updateMany).not.toHaveBeenCalled();
  });

  it("marks account as disconnected and sends email to the disconnected account on invalid_grant when account is watched", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(mockEmailAccount as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      failedAccessToken: "access-token",
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "acc_1",
          updatedAt: mockEmailAccount.account.updatedAt,
          disconnectedAt: null,
        },
        data: expect.objectContaining({
          disconnectedAt: expect.any(Date),
        }),
      }),
    );
    expect(sendReconnectionEmail).toHaveBeenCalled();
    expect(sendReconnectionEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "test@example.com",
        emailProps: expect.objectContaining({
          email: "test@example.com",
        }),
      }),
    );
    expect(addUserErrorMessage).toHaveBeenCalledWith(
      "user_1",
      "Account disconnected",
      expect.stringContaining("test@example.com"),
      logger,
    );
  });

  it("marks as disconnected and sends action-required email if account is not watched", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...mockEmailAccount,
      watchEmailsExpirationDate: null,
    } as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      failedAccessToken: "access-token",
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.updateMany).toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        userEmail: "test@example.com",
        emailAccountId: "ea_1",
        errorType: "Account disconnected",
        errorMessage: expect.stringContaining("test@example.com"),
        logger,
      }),
    );
  });

  it("clears stale credentials if account is already disconnected", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...mockEmailAccount,
      account: {
        updatedAt: mockEmailAccount.account.updatedAt,
        disconnectedAt: new Date(),
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: 1_700_000_000,
      },
    } as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      failedAccessToken: "access-token",
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.updateMany).toHaveBeenCalledWith({
      where: {
        id: "acc_1",
        updatedAt: mockEmailAccount.account.updatedAt,
        disconnectedAt: { not: null },
      },
      data: {
        access_token: null,
        refresh_token: null,
        expires_at: null,
      },
    });
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessage).not.toHaveBeenCalled();
    expect(addUserErrorMessageWithNotification).not.toHaveBeenCalled();
  });

  it("does not write when a disconnected account has no credentials left", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      ...mockEmailAccount,
      account: {
        updatedAt: mockEmailAccount.account.updatedAt,
        disconnectedAt: new Date(),
        access_token: null,
        refresh_token: null,
        expires_at: null,
      },
    } as any);

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      failedAccessToken: null,
      reason: "invalid_grant",
      logger,
    });

    expect(prisma.account.updateMany).not.toHaveBeenCalled();
  });

  it("sends action-required email for insufficient permissions", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(mockEmailAccount as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      failedAccessToken: "access-token",
      reason: "insufficient_permissions",
      logger,
    });

    expect(prisma.account.updateMany).toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        userEmail: "test@example.com",
        emailAccountId: "ea_1",
        errorType: "Account disconnected",
        errorMessage: expect.stringContaining("missing required permissions"),
        logger,
      }),
    );
  });

  it("sends action-required email for provider policy blocks", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(mockEmailAccount as any);
    prisma.account.updateMany.mockResolvedValue({ count: 1 });

    await cleanupInvalidTokens({
      emailAccountId: "ea_1",
      failedAccessToken: "access-token",
      reason: "policy_enforced",
      logger,
    });

    expect(prisma.account.updateMany).toHaveBeenCalled();
    expect(sendReconnectionEmail).not.toHaveBeenCalled();
    expect(addUserErrorMessageWithNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user_1",
        userEmail: "test@example.com",
        emailAccountId: "ea_1",
        errorType: "Account disconnected",
        errorMessage: expect.stringContaining("security policy"),
        logger,
      }),
    );
  });
});
