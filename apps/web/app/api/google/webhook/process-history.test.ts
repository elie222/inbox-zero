import { describe, it, expect, vi, beforeEach } from "vitest";
import { processHistoryForUser } from "./process-history";
import { getHistory } from "@/utils/gmail/history";
import { processHistoryItem } from "@/app/api/google/webhook/process-history-item";
import {
  getWebhookEmailAccount,
  validateWebhookAccount,
} from "@/utils/webhook/validate-webhook-account";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("test");
// Mock logger.with to return the same logger instance so spies work
vi.spyOn(logger, "with").mockReturnValue(logger);

vi.mock("server-only", () => ({}));

vi.mock("@/utils/gmail/client", () => ({
  getGmailClientWithRefresh: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/utils/gmail/history", () => ({
  getHistory: vi.fn(),
}));

vi.mock("@/app/api/google/webhook/process-history-item", () => ({
  processHistoryItem: vi.fn(),
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

vi.mock("@/utils/error", () => ({
  captureException: vi.fn(),
}));

describe("processHistoryForUser - 404 Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("should log a warning when history items are skipped due to large gap", async () => {
    const email = "user@test.com";
    const historyId = 2000; // Gap of 1000 (2000 - 1000)
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

    const warnSpy = vi.spyOn(logger, "warn");

    await processHistoryForUser({ emailAddress: email, historyId }, {}, logger);

    expect(warnSpy).toHaveBeenCalledWith(
      "Skipping history items due to large gap",
      expect.objectContaining({
        lastSyncedHistoryId: 1000,
        webhookHistoryId: 2000,
        skippedHistoryItems: 500, // (2000 - 500) - 1000 = 500
      }),
    );
  });

  it("should aggregate history across pages", async () => {
    const email = "user@test.com";
    const historyId = 1200;
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
        history: [
          {
            id: "1101",
            messagesAdded: [
              {
                message: {
                  id: "m-1",
                  threadId: "t-1",
                  labelIds: ["INBOX"],
                },
              },
            ],
          },
        ],
        nextPageToken: "page-2",
      } as any)
      .mockResolvedValueOnce({
        history: [
          {
            id: "1102",
            messagesAdded: [
              {
                message: {
                  id: "m-2",
                  threadId: "t-2",
                  labelIds: ["INBOX"],
                },
              },
            ],
          },
        ],
      } as any);

    await processHistoryForUser({ emailAddress: email, historyId }, {}, logger);

    expect(vi.mocked(getHistory)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processHistoryItem)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(processHistoryItem)).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          message: expect.objectContaining({ id: "m-1" }),
        }),
      }),
      expect.any(Object),
      expect.any(Object),
    );
    expect(vi.mocked(processHistoryItem)).toHaveBeenCalledWith(
      expect.objectContaining({
        item: expect.objectContaining({
          message: expect.objectContaining({ id: "m-2" }),
        }),
      }),
      expect.any(Object),
      expect.any(Object),
    );
  });

  it("should warn when Gmail history pagination is capped", async () => {
    const email = "user@test.com";
    const historyId = 1200;
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
        history: [],
        nextPageToken: "page-2",
      } as any)
      .mockResolvedValueOnce({
        history: [],
        nextPageToken: "page-3",
      } as any)
      .mockResolvedValueOnce({
        history: [],
        nextPageToken: "page-4",
      } as any);

    const warnSpy = vi.spyOn(logger, "warn");

    await processHistoryForUser({ emailAddress: email, historyId }, {}, logger);

    expect(vi.mocked(getHistory)).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      "Gmail history pagination capped",
      expect.objectContaining({
        pagesFetched: 3,
        maxPages: 3,
      }),
    );
  });
});
