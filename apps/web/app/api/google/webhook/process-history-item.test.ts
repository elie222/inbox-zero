import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  shouldRunColdEmailBlocker,
  processHistoryItem,
} from "./process-history-item";
import { ColdEmailSetting } from "@prisma/client";
import type { gmail_v1 } from "@googleapis/gmail";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { runColdEmailBlocker } from "@/utils/cold-email/is-cold-email";
import { blockUnsubscribedEmails } from "@/app/api/google/webhook/block-unsubscribed-emails";
import { getMessage } from "@/utils/gmail/message";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { GmailLabel } from "@/utils/gmail/label";
import { categorizeSender } from "@/utils/categorize/senders/categorize";
import { runRules } from "@/utils/ai/choose-rule/run-rules";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";
import { getEmailAccount } from "@/__tests__/helpers";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: vi.fn((callback) => callback()),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/utils/gmail/message", () => ({
  getMessage: vi.fn().mockResolvedValue({
    id: "123",
    threadId: "thread-123",
    labelIds: ["INBOX"],
    payload: {
      headers: [
        { name: "From", value: "sender@example.com" },
        { name: "To", value: "user@test.com" },
        { name: "Subject", value: "Test Email" },
        { name: "Date", value: "2024-01-01T00:00:00Z" },
      ],
      parts: [
        {
          body: {
            data: "SGVsbG8gV29ybGQ=", // Base64 encoded "Hello World"
          },
        },
      ],
    },
  }),
}));
vi.mock("@/utils/gmail/thread", () => ({
  getThreadMessages: vi.fn().mockResolvedValue([
    {
      id: "123",
      threadId: "thread-123",
      labelIds: ["INBOX"],
      internalDate: "1704067200000", // 2024-01-01T00:00:00Z
      headers: {
        from: "sender@example.com",
        to: "user@test.com",
        subject: "Test Email",
        date: "2024-01-01T00:00:00Z",
      },
      body: "Hello World",
    },
  ]),
}));
vi.mock("@/utils/assistant/is-assistant-email", () => ({
  isAssistantEmail: vi.fn().mockReturnValue(false),
}));
vi.mock("@/utils/cold-email/is-cold-email", () => ({
  runColdEmailBlocker: vi
    .fn()
    .mockResolvedValue({ isColdEmail: false, reason: "hasPreviousEmail" }),
}));
vi.mock("@/app/api/google/webhook/block-unsubscribed-emails", () => ({
  blockUnsubscribedEmails: vi.fn().mockResolvedValue(false),
}));
vi.mock("@/utils/categorize/senders/categorize", () => ({
  categorizeSender: vi.fn(),
}));
vi.mock("@/utils/ai/choose-rule/run-rules", () => ({
  runRules: vi.fn(),
}));
vi.mock("@/utils/assistant/process-assistant-email", () => ({
  processAssistantEmail: vi.fn().mockResolvedValue(undefined),
}));

describe("processHistoryItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createHistoryItem = (
    messageId = "123",
    threadId = "thread-123",
  ): gmail_v1.Schema$HistoryMessageAdded => ({
    message: { id: messageId, threadId },
  });

  const defaultOptions = {
    gmail: {} as any,
    email: "user@test.com",
    accessToken: "fake-token",
    hasAutomationRules: false,
    hasAiAccess: false,
    rules: [],
    history: [] as gmail_v1.Schema$History[],
  };

  function getDefaultEmailAccount() {
    return {
      ...getEmailAccount(),
      coldEmailPrompt: null,
      coldEmailBlocker: ColdEmailSetting.DISABLED,
      autoCategorizeSenders: false,
    };
  }

  it("should skip if message is already being processed", async () => {
    vi.mocked(markMessageAsProcessing).mockResolvedValueOnce(false);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };

    await processHistoryItem(createHistoryItem(), options);

    expect(getMessage).not.toHaveBeenCalled();
  });

  it("should skip if message is an assistant email", async () => {
    vi.mocked(isAssistantEmail).mockReturnValueOnce(true);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };
    await processHistoryItem(createHistoryItem(), options);

    expect(blockUnsubscribedEmails).not.toHaveBeenCalled();
    expect(runColdEmailBlocker).not.toHaveBeenCalled();
    expect(processAssistantEmail).toHaveBeenCalledWith({
      message: expect.objectContaining({
        headers: expect.objectContaining({
          from: "sender@example.com",
          to: "user@test.com",
        }),
      }),
      userEmail: "user@test.com",
      emailAccountId: "email-account-id",
      gmail: expect.any(Object),
    });
  });

  it("should skip if message is outbound", async () => {
    vi.mocked(getMessage).mockResolvedValueOnce({
      id: "123",
      threadId: "thread-123",
      labelIds: [GmailLabel.SENT],
      payload: {
        headers: [
          { name: "From", value: "user@test.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Subject", value: "Test Email" },
          { name: "Date", value: "2024-01-01T00:00:00Z" },
        ],
      },
    });

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };
    await processHistoryItem(createHistoryItem(), options);

    expect(blockUnsubscribedEmails).not.toHaveBeenCalled();
    expect(runColdEmailBlocker).not.toHaveBeenCalled();
  });

  it("should skip if email is unsubscribed", async () => {
    vi.mocked(blockUnsubscribedEmails).mockResolvedValueOnce(true);

    const options = {
      ...defaultOptions,
      emailAccount: getDefaultEmailAccount(),
    };
    await processHistoryItem(createHistoryItem(), options);

    expect(runColdEmailBlocker).not.toHaveBeenCalled();
  });

  it("should run cold email blocker when enabled", async () => {
    const options = {
      ...defaultOptions,
      emailAccount: {
        ...getDefaultEmailAccount(),
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
      },
      hasAiAccess: true,
    };

    await processHistoryItem(createHistoryItem(), options);

    expect(runColdEmailBlocker).toHaveBeenCalledWith({
      email: expect.objectContaining({
        from: "sender@example.com",
        subject: "Test Email",
        content: expect.any(String),
        id: "123",
        threadId: "thread-123",
        date: expect.any(Date),
      }),
      gmail: options.gmail,
      emailAccount: options.emailAccount,
    });
  });

  it("should skip further processing if cold email is detected", async () => {
    vi.mocked(runColdEmailBlocker).mockResolvedValueOnce({
      isColdEmail: true,
      reason: "ai",
      aiReason: "This appears to be a cold email",
    });

    const options = {
      ...defaultOptions,
      emailAccount: {
        ...getDefaultEmailAccount(),
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
        autoCategorizeSenders: true,
      },
      hasAutomationRules: true,
      hasAiAccess: true,
    };

    await processHistoryItem(createHistoryItem(), options);

    // Verify that further processing is skipped
    expect(categorizeSender).not.toHaveBeenCalled();
    expect(runRules).not.toHaveBeenCalled();
  });
});

describe("shouldRunColdEmailBlocker", () => {
  it("should return true when coldEmailBlocker is ARCHIVE_AND_READ_AND_LABEL and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
      true,
    );
    expect(result).toBe(true);
  });

  it("should return true when coldEmailBlocker is ARCHIVE_AND_LABEL and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      true,
    );
    expect(result).toBe(true);
  });

  it("should return true when coldEmailBlocker is LABEL and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(ColdEmailSetting.LABEL, true);
    expect(result).toBe(true);
  });

  it("should return false when coldEmailBlocker is DISABLED and hasColdEmailAccess is true", () => {
    const result = shouldRunColdEmailBlocker(ColdEmailSetting.DISABLED, true);
    expect(result).toBe(false);
  });

  it("should return false when hasColdEmailAccess is false", () => {
    const result = shouldRunColdEmailBlocker(
      ColdEmailSetting.ARCHIVE_AND_LABEL,
      false,
    );
    expect(result).toBe(false);
  });
});
