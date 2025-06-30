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
import { enqueueDigestItem } from "@/utils/digest/index";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({
  after: vi.fn((callback) => callback()),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis/message-processing", () => ({
  markMessageAsProcessing: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/utils/gmail/message", () => ({
  getMessage: vi.fn().mockImplementation(async (messageId, gmail, format) => ({
    id: messageId,
    threadId: messageId === "456" ? "thread-456" : "thread-123",
    labelIds: ["INBOX"],
    snippet: "Test email snippet",
    historyId: "12345",
    internalDate: "1704067200000",
    sizeEstimate: 1024,
    payload: {
      partId: "",
      mimeType: "multipart/alternative",
      filename: "",
      headers: [
        { name: "From", value: "sender@example.com" },
        { name: "To", value: "user@test.com" },
        { name: "Subject", value: "Test Email" },
        { name: "Date", value: "2024-01-01T00:00:00Z" },
        { name: "Message-ID", value: `<${messageId}@example.com>` },
      ],
      body: {
        size: 0,
      },
      parts: [
        {
          partId: "0",
          mimeType: "text/plain",
          filename: "",
          headers: [
            { name: "Content-Type", value: "text/plain; charset=UTF-8" },
          ],
          body: {
            size: 11,
            data: "SGVsbG8gV29ybGQ=", // Base64 encoded "Hello World"
          },
        },
        {
          partId: "1",
          mimeType: "text/html",
          filename: "",
          headers: [
            { name: "Content-Type", value: "text/html; charset=UTF-8" },
          ],
          body: {
            size: 25,
            data: "PGI+SGVsbG8gV29ybGQ8L2I+", // Base64 encoded "<b>Hello World</b>"
          },
        },
      ],
    },
  })),
}));
vi.mock("@/utils/gmail/thread", () => ({
  getThreadMessages: vi.fn().mockImplementation(async (gmail, threadId) => [
    {
      id: threadId === "thread-456" ? "456" : "123",
      threadId: threadId,
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
vi.mock("@/utils/digest/index", () => ({
  enqueueDigestItem: vi.fn().mockResolvedValue(undefined),
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
      coldEmailDigest: false,
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
      snippet: "Test email snippet",
      historyId: "12345",
      internalDate: "1704067200000",
      sizeEstimate: 1024,
      payload: {
        partId: "",
        mimeType: "multipart/alternative",
        filename: "",
        headers: [
          { name: "From", value: "user@test.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Subject", value: "Test Email" },
          { name: "Date", value: "2024-01-01T00:00:00Z" },
          { name: "Message-ID", value: "<123@example.com>" },
        ],
        body: {
          size: 0,
        },
        parts: [
          {
            partId: "0",
            mimeType: "text/plain",
            filename: "",
            headers: [
              { name: "Content-Type", value: "text/plain; charset=UTF-8" },
            ],
            body: {
              size: 11,
              data: "SGVsbG8gV29ybGQ=", // Base64 encoded "Hello World"
            },
          },
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

    // Verify that cold email is NOT added to digest when coldEmailDigest is false
    expect(enqueueDigestItem).not.toHaveBeenCalled();

    // Verify that further processing is skipped
    expect(categorizeSender).not.toHaveBeenCalled();
    expect(runRules).not.toHaveBeenCalled();
  });

  it("should add cold email to digest when coldEmailDigest is true and cold email is detected", async () => {
    vi.mocked(runColdEmailBlocker).mockResolvedValueOnce({
      isColdEmail: true,
      reason: "ai",
      aiReason: "This appears to be a cold email",
      coldEmailId: "cold-email-123",
    });

    const options = {
      ...defaultOptions,
      emailAccount: {
        ...getDefaultEmailAccount(),
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
        coldEmailDigest: true,
        autoCategorizeSenders: true,
      },
      hasAutomationRules: true,
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

    // Verify that cold email is added to digest
    expect(enqueueDigestItem).toHaveBeenCalledWith({
      email: expect.objectContaining({
        id: "123",
        threadId: "thread-123",
        headers: expect.objectContaining({
          from: "sender@example.com",
          subject: "Test Email",
        }),
      }),
      emailAccountId: "email-account-id",
      coldEmailId: "cold-email-123",
    });

    // Verify that further processing is still skipped
    expect(categorizeSender).not.toHaveBeenCalled();
    expect(runRules).not.toHaveBeenCalled();
  });

  it("should not run cold email blocker when coldEmailBlocker is DISABLED even with coldEmailDigest true", async () => {
    const options = {
      ...defaultOptions,
      emailAccount: {
        ...getDefaultEmailAccount(),
        coldEmailBlocker: ColdEmailSetting.DISABLED,
        coldEmailDigest: true,
        autoCategorizeSenders: true,
      },
      hasAutomationRules: true,
      hasAiAccess: true,
    };

    await processHistoryItem(createHistoryItem(), options);

    expect(runColdEmailBlocker).not.toHaveBeenCalled();
    expect(categorizeSender).toHaveBeenCalled();
    expect(runRules).toHaveBeenCalled();
  });

  it("should process normally when cold email is not detected with coldEmailDigest enabled", async () => {
    vi.mocked(runColdEmailBlocker).mockResolvedValueOnce({
      isColdEmail: false,
      reason: "hasPreviousEmail",
    });

    const options = {
      ...defaultOptions,
      emailAccount: {
        ...getDefaultEmailAccount(),
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
        coldEmailDigest: true,
        autoCategorizeSenders: true,
      },
      hasAutomationRules: true,
      hasAiAccess: true,
    };

    await processHistoryItem(createHistoryItem(), options);

    expect(runColdEmailBlocker).toHaveBeenCalled();
    expect(categorizeSender).toHaveBeenCalled();
    expect(runRules).toHaveBeenCalled();
  });

  it("should add second email from known cold emailer to digest when coldEmailDigest is enabled", async () => {
    // Mock the response for a known cold emailer (already in database)
    vi.mocked(runColdEmailBlocker).mockResolvedValueOnce({
      isColdEmail: true,
      reason: "ai-already-labeled",
      coldEmailId: "existing-cold-email-456", // Existing cold email entry ID
    });

    const options = {
      ...defaultOptions,
      emailAccount: {
        ...getDefaultEmailAccount(),
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
        coldEmailDigest: true,
        autoCategorizeSenders: true,
      },
      hasAutomationRules: true,
      hasAiAccess: true,
    };

    await processHistoryItem(createHistoryItem("456", "thread-456"), options);

    expect(runColdEmailBlocker).toHaveBeenCalledWith({
      email: expect.objectContaining({
        from: "sender@example.com",
        subject: "Test Email",
        content: expect.any(String),
        id: "456",
        threadId: "thread-456",
        date: expect.any(Date),
      }),
      gmail: options.gmail,
      emailAccount: options.emailAccount,
    });

    // Verify that the second email from known cold emailer is added to digest
    // with reference to the existing cold email entry
    expect(enqueueDigestItem).toHaveBeenCalledWith({
      email: expect.objectContaining({
        id: "456",
        threadId: "thread-456",
        headers: expect.objectContaining({
          from: "sender@example.com",
          subject: "Test Email",
        }),
      }),
      emailAccountId: "email-account-id",
      coldEmailId: "existing-cold-email-456",
    });

    // Verify that further processing is still skipped for cold emails
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
