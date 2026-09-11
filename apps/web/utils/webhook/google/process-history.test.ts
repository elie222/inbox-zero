import { describe, it, expect, vi, beforeEach } from "vitest";
import { processHistoryForUser } from "./process-history";
import { cleanupInvalidTokens } from "@/utils/auth/cleanup-invalid-tokens";
import { getHistory } from "@/utils/gmail/history";
import {
  getWebhookEmailAccount,
  validateWebhookAccount,
} from "@/utils/webhook/validate-webhook-account";
import prisma from "@/utils/prisma";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/utils/gmail/history", () => ({
  getHistory: vi.fn(),
}));

vi.mock("@/utils/webhook/validate-webhook-account", () => ({
  getWebhookEmailAccount: vi.fn(),
  validateWebhookAccount: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: {
      update: vi.fn().mockResolvedValue({}),
    },
    $executeRaw: vi.fn().mockResolvedValue(1),
  },
}));

vi.mock("@/utils/error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/error")>()),
  captureException: vi.fn(),
}));

vi.mock("@/utils/auth/cleanup-invalid-tokens", () => ({
  cleanupInvalidTokens: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/email/rate-limit", () => ({
  getEmailProviderRateLimitState: vi.fn().mockResolvedValue(null),
  withRateLimitRecording: vi.fn(async (_context, operation) => operation()),
}));

describe("processHistoryForUser - 404 Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailProviderRateLimitState).mockResolvedValue(null);
  });

  it("should reset lastSyncedHistoryId when Gmail returns 404 (expired historyId)", async () => {
    const email = "user@test.com";
    const historyId = 2000;
    const emailAccount = {
      id: "account-123",
      email,
      lastSyncedHistoryId: "1000",
    };

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(emailAccount as any);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          ...emailAccount,
          account: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);

    // Simulate Gmail 404 error
    const error404 = new Error("Requested entity was not found");
    (error404 as any).status = 404;
    vi.mocked(getHistory).mockRejectedValue(error404);

    const result = await processHistoryForUser(
      { emailAddress: email, historyId },
      {},
      logger,
    );

    const jsonResponse = await (result as any).json();
    expect(jsonResponse).toEqual({ ok: true });

    // Verify lastSyncedHistoryId was updated to the current historyId via conditional update
    expect(prisma.$executeRaw).toHaveBeenCalled();
  });

  it("should skip webhook history calls while account is in rate-limit mode", async () => {
    const email = "user@test.com";
    const historyId = 2000;
    const emailAccount = {
      id: "account-123",
      email,
      lastSyncedHistoryId: "1000",
    };

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(emailAccount as any);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          ...emailAccount,
          account: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);
    vi.mocked(getEmailProviderRateLimitState).mockResolvedValue({
      provider: "google",
      retryAt: new Date(Date.now() + 60_000),
      source: "test",
    });

    const result = await processHistoryForUser(
      { emailAddress: email, historyId },
      {},
      logger,
    );

    const jsonResponse = await (result as any).json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(getHistory).not.toHaveBeenCalled();
  });

  it("should continue processing when rate-limit state lookup fails", async () => {
    const email = "user@test.com";
    const historyId = 2000;
    const emailAccount = {
      id: "account-123",
      email,
      lastSyncedHistoryId: "1000",
    };

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(emailAccount as any);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          ...emailAccount,
          account: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);
    vi.mocked(getEmailProviderRateLimitState).mockRejectedValueOnce(
      new Error("redis unavailable"),
    );
    vi.mocked(getHistory).mockResolvedValue({ history: [] });

    const result = await processHistoryForUser(
      { emailAddress: email, historyId },
      {},
      logger,
    );

    const jsonResponse = await (result as any).json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(getHistory).toHaveBeenCalled();
  });

  it("does not truncate moderate history ID gaps", async () => {
    const email = "user@test.com";
    const historyId = 1819;
    const emailAccount = {
      id: "account-123",
      email,
      lastSyncedHistoryId: "1000",
    };

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(emailAccount as any);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          ...emailAccount,
          account: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);

    vi.mocked(getHistory).mockResolvedValue({ history: [] });

    await processHistoryForUser({ emailAddress: email, historyId }, {}, logger);

    expect(getHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startHistoryId: "1000" }),
      expect.any(Object),
    );
  });

  it("advances cursor when large-gap history is truncated", async () => {
    const email = "user@test.com";
    const historyId = 5000;
    const emailAccount = {
      id: "account-123",
      email,
      lastSyncedHistoryId: "1000",
    };

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(emailAccount as any);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          ...emailAccount,
          account: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);

    vi.mocked(getHistory).mockResolvedValue({ history: [] });

    await processHistoryForUser({ emailAddress: email, historyId }, {}, logger);

    expect(getHistory).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ startHistoryId: "2000" }),
      expect.any(Object),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it("fetches all Gmail history pages before processing catch-up", async () => {
    const email = "user@test.com";
    const historyId = 2000;
    const emailAccount = {
      id: "account-123",
      email,
      lastSyncedHistoryId: "1000",
    };

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(emailAccount as any);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          ...emailAccount,
          account: {
            access_token: "token",
            refresh_token: "refresh",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);

    vi.mocked(getHistory)
      .mockResolvedValueOnce({
        history: [{ id: "1100", messagesAdded: [] }],
        nextPageToken: "page-2",
      })
      .mockResolvedValueOnce({
        history: [{ id: "1200", messagesAdded: [] }],
      });

    await processHistoryForUser({ emailAddress: email, historyId }, {}, logger);

    expect(getHistory).toHaveBeenCalledTimes(2);
    expect(getHistory).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      expect.objectContaining({
        startHistoryId: "1000",
        maxResults: 500,
        pageToken: undefined,
      }),
      expect.any(Object),
    );
    expect(getHistory).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        startHistoryId: "1000",
        maxResults: 500,
        pageToken: "page-2",
      }),
      expect.any(Object),
    );
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });
});

describe("processHistoryForUser - authentication failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEmailProviderRateLimitState).mockResolvedValue(null);
    vi.mocked(cleanupInvalidTokens).mockResolvedValue(undefined);
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: {
          id: "account-123",
          email: "user@example.com",
          userId: "user-123",
          lastSyncedHistoryId: "1000",
          account: {
            access_token: "original-access-token",
            refresh_token: "failed-refresh-token",
            expires_at: new Date(Date.now() + 3_600_000),
          },
          rules: [],
        },
        hasAutomationRules: false,
        hasAiAccess: false,
      },
    } as any);
  });

  it.each([
    "invalid_grant",
    "Token refresh failed: invalid_grant",
  ])("cleans up the failed grant before acknowledging %s from a Gmail API call", async (message) => {
    vi.mocked(getHistory).mockRejectedValueOnce(new Error(message));

    const response = await processHistoryForUser(
      { emailAddress: "user@example.com", historyId: 2000 },
      {},
      logger,
    );

    expect(cleanupInvalidTokens).toHaveBeenCalledExactlyOnceWith({
      emailAccountId: "account-123",
      reason: "invalid_grant",
      // Access tokens can rotate during client creation without changing the grant.
      failedRefreshToken: "failed-refresh-token",
      logger: expect.any(Object),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it("acknowledges invalid grants even if cleanup fails", async () => {
    vi.mocked(getHistory).mockRejectedValueOnce(new Error("invalid_grant"));
    vi.mocked(cleanupInvalidTokens).mockRejectedValueOnce(
      new Error("Database unavailable"),
    );

    const response = await processHistoryForUser(
      { emailAddress: "user@example.com", historyId: 2000 },
      {},
      logger,
    );

    expect(cleanupInvalidTokens).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ ok: true });
  });

  it("does not disconnect accounts for transient Gmail API failures", async () => {
    vi.mocked(getHistory).mockRejectedValueOnce(
      new Error("Service unavailable"),
    );

    await processHistoryForUser(
      { emailAddress: "user@example.com", historyId: 2000 },
      {},
      logger,
    );

    expect(cleanupInvalidTokens).not.toHaveBeenCalled();
  });
});
