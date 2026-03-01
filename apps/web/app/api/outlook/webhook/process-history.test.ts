import { describe, it, expect, vi, beforeEach } from "vitest";
import { processHistoryForUser } from "./process-history";
import {
  getWebhookEmailAccount,
  validateWebhookAccount,
} from "@/utils/webhook/validate-webhook-account";
import { createEmailProvider } from "@/utils/email/provider";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { learnFromOutlookCategoryReversal } from "./learn-label-removal";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("test");
vi.spyOn(logger, "with").mockReturnValue(logger);

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => callback()),
  };
});

vi.mock("@/utils/webhook/validate-webhook-account", () => ({
  getWebhookEmailAccount: vi.fn(),
  validateWebhookAccount: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: vi.fn(),
}));

vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn(),
}));

vi.mock("@/utils/webhook/process-history-item", () => ({
  processHistoryItem: vi.fn(),
}));
vi.mock("./learn-label-removal", () => ({
  learnFromOutlookCategoryReversal: vi.fn(),
}));
vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock("@/utils/error", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/error")>();
  return {
    ...actual,
    captureException: vi.fn(),
  };
});

describe("Outlook processHistoryForUser - Folder Filtering", () => {
  const mockEmailAccount = {
    id: "account-123",
    email: "user@test.com",
    userId: "user-123",
    account: { provider: "microsoft" },
    rules: [],
  };

  const mockResourceData = {
    id: "message-123",
    "@odata.type": "#Microsoft.Graph.Message",
  };

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getWebhookEmailAccount).mockResolvedValue(
      mockEmailAccount as any,
    );
    vi.mocked(validateWebhookAccount).mockResolvedValue({
      success: true,
      data: {
        emailAccount: mockEmailAccount,
        hasAutomationRules: true,
        hasAiAccess: true,
      },
    } as any);
    vi.mocked(markMessageAsProcessing).mockResolvedValue(true);
    vi.mocked(processHistoryItem).mockResolvedValue(undefined);
    vi.mocked(learnFromOutlookCategoryReversal).mockResolvedValue(undefined);
    vi.mocked(prisma.executedRule.findFirst).mockResolvedValue(null);
  });

  it("processes messages in INBOX folder", async () => {
    const inboxMessage = getMockParsedMessage({ labelIds: ["INBOX"] });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(inboxMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(markMessageAsProcessing).toHaveBeenCalledWith({
      userEmail: "user@test.com",
      messageId: "message-123",
    });
    expect(processHistoryItem).toHaveBeenCalledWith(
      { messageId: "message-123", message: inboxMessage },
      expect.any(Object),
    );
    expect(learnFromOutlookCategoryReversal).not.toHaveBeenCalled();
  });

  it("processes messages in SENT folder", async () => {
    const sentMessage = getMockParsedMessage({ labelIds: ["SENT"] });
    const mockProvider = { getMessage: vi.fn().mockResolvedValue(sentMessage) };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(markMessageAsProcessing).toHaveBeenCalled();
    expect(processHistoryItem).toHaveBeenCalled();
    expect(learnFromOutlookCategoryReversal).not.toHaveBeenCalled();
  });

  it("skips messages in DRAFT folder without acquiring lock", async () => {
    const draftMessage = getMockParsedMessage({ labelIds: ["DRAFT"] });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(draftMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

    const infoSpy = vi.spyOn(logger, "info");

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(markMessageAsProcessing).not.toHaveBeenCalled();
    expect(processHistoryItem).not.toHaveBeenCalled();
    expect(learnFromOutlookCategoryReversal).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "Skipping message not in inbox or sent items",
      expect.objectContaining({ labelIds: ["DRAFT"] }),
    );
  });

  it("skips messages in TRASH folder without acquiring lock", async () => {
    const trashMessage = getMockParsedMessage({ labelIds: ["TRASH"] });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(trashMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(markMessageAsProcessing).not.toHaveBeenCalled();
    expect(processHistoryItem).not.toHaveBeenCalled();
    expect(learnFromOutlookCategoryReversal).not.toHaveBeenCalled();
  });

  it("skips messages with no labelIds without acquiring lock", async () => {
    const noLabelMessage = getMockParsedMessage({ labelIds: undefined });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(noLabelMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(markMessageAsProcessing).not.toHaveBeenCalled();
    expect(processHistoryItem).not.toHaveBeenCalled();
    expect(learnFromOutlookCategoryReversal).not.toHaveBeenCalled();
  });

  it("skips processing when lock cannot be acquired", async () => {
    const inboxMessage = getMockParsedMessage({ labelIds: ["INBOX"] });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(inboxMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);
    vi.mocked(markMessageAsProcessing).mockResolvedValue(false);

    const infoSpy = vi.spyOn(logger, "info");

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(markMessageAsProcessing).toHaveBeenCalled();
    expect(processHistoryItem).not.toHaveBeenCalled();
    expect(learnFromOutlookCategoryReversal).not.toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalledWith(
      "Skipping. Message already being processed.",
    );
  });

  it("passes pre-fetched message to processHistoryItem to avoid refetching", async () => {
    const inboxMessage = getMockParsedMessage({
      id: "message-123",
      labelIds: ["INBOX"],
    });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(inboxMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

    await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    expect(processHistoryItem).toHaveBeenCalledWith(
      { messageId: "message-123", message: inboxMessage },
      expect.objectContaining({
        provider: mockProvider,
      }),
    );
  });

  it("learns from Outlook label removal when rule already exists", async () => {
    const inboxMessage = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: ["INBOX"],
    });
    const mockProvider = {
      getMessage: vi.fn().mockResolvedValue(inboxMessage),
    };
    vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);
    vi.mocked(prisma.executedRule.findFirst).mockResolvedValue({
      id: "exec-rule-123",
    } as any);

    const result = await processHistoryForUser({
      subscriptionId: "sub-123",
      resourceData: mockResourceData as any,
      logger,
    });

    const jsonResponse = await result.json();
    expect(jsonResponse).toEqual({ ok: true });
    expect(learnFromOutlookCategoryReversal).toHaveBeenCalledWith({
      message: inboxMessage,
      emailAccountId: "account-123",
      logger,
    });
    expect(processHistoryItem).not.toHaveBeenCalled();
  });

  describe("error handling", () => {
    it("handles Outlook throttling errors gracefully without Sentry", async () => {
      const error = Object.assign(new Error("Throttled"), {
        code: "ApplicationThrottled",
        statusCode: 429,
      });
      const mockProvider = { getMessage: vi.fn().mockRejectedValue(error) };
      vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

      const result = await processHistoryForUser({
        subscriptionId: "sub-123",
        resourceData: mockResourceData as any,
        logger,
      });

      const jsonResponse = await result.json();
      expect(jsonResponse).toEqual({ ok: true });
      expect(captureException).not.toHaveBeenCalled();
    });

    it("handles Outlook access denied errors gracefully without Sentry", async () => {
      const error = Object.assign(
        new Error("Access is denied. Check credentials and try again."),
        {
          code: "ErrorAccessDenied",
        },
      );
      const mockProvider = { getMessage: vi.fn().mockRejectedValue(error) };
      vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

      const result = await processHistoryForUser({
        subscriptionId: "sub-123",
        resourceData: mockResourceData as any,
        logger,
      });

      const jsonResponse = await result.json();
      expect(jsonResponse).toEqual({ ok: true });
      expect(captureException).not.toHaveBeenCalled();
    });

    it("handles Outlook item not found errors gracefully without Sentry", async () => {
      const error = Object.assign(
        new Error("The store ID provided isn't an ID of an item."),
        {
          code: "ErrorItemNotFound",
        },
      );
      const mockProvider = { getMessage: vi.fn().mockRejectedValue(error) };
      vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

      const result = await processHistoryForUser({
        subscriptionId: "sub-123",
        resourceData: mockResourceData as any,
        logger,
      });

      const jsonResponse = await result.json();
      expect(jsonResponse).toEqual({ ok: true });
      expect(captureException).not.toHaveBeenCalled();
    });

    it("captures unknown errors in Sentry", async () => {
      const error = new Error("Something unexpected");
      const mockProvider = { getMessage: vi.fn().mockRejectedValue(error) };
      vi.mocked(createEmailProvider).mockResolvedValue(mockProvider as any);

      const result = await processHistoryForUser({
        subscriptionId: "sub-123",
        resourceData: mockResourceData as any,
        logger,
      });

      const jsonResponse = await result.json();
      expect(jsonResponse).toEqual({ error: true });
      expect(captureException).toHaveBeenCalled();
    });
  });
});
