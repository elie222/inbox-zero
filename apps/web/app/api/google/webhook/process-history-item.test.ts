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
import { runRulesOnMessage } from "@/utils/ai/choose-rule/run-rules";
import { processAssistantEmail } from "@/utils/assistant/process-assistant-email";

vi.mock("server-only", () => ({}));
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
        { name: "To", value: "user@example.com" },
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
  runRulesOnMessage: vi.fn(),
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

  interface TestUser {
    id: string;
    email: string | null;
    about: string | null;
    coldEmailBlocker: ColdEmailSetting | null;
    coldEmailPrompt: string | null;
    autoCategorizeSenders: boolean;
    aiProvider: string;
    aiModel: string;
    aiApiKey: string | null;
  }

  const defaultUser: TestUser = {
    id: "user-123",
    email: "user@example.com",
    about: null,
    coldEmailBlocker: ColdEmailSetting.DISABLED,
    coldEmailPrompt: null,
    autoCategorizeSenders: false,
    aiProvider: "openai",
    aiModel: "gpt-4",
    aiApiKey: null,
  };

  const createOptions = (overrides: { [key: string]: any } = {}) => {
    const user = overrides.user
      ? { ...defaultUser, ...overrides.user }
      : defaultUser;
    return {
      gmail: {} as any,
      email: "user@example.com",
      user,
      accessToken: "fake-token",
      hasColdEmailAccess: false,
      hasAutomationRules: false,
      hasAiAutomationAccess: false,
      rules: [],
      history: [] as gmail_v1.Schema$History[],
      ...overrides,
    };
  };

  it("should skip if message is already being processed", async () => {
    vi.mocked(markMessageAsProcessing).mockResolvedValueOnce(false);

    await processHistoryItem(createHistoryItem(), createOptions());

    expect(getMessage).not.toHaveBeenCalled();
  });

  it("should skip if message is an assistant email", async () => {
    vi.mocked(isAssistantEmail).mockReturnValueOnce(true);

    await processHistoryItem(createHistoryItem(), createOptions());

    expect(blockUnsubscribedEmails).not.toHaveBeenCalled();
    expect(runColdEmailBlocker).not.toHaveBeenCalled();
    expect(processAssistantEmail).toHaveBeenCalledWith({
      message: expect.objectContaining({
        headers: expect.objectContaining({
          from: "sender@example.com",
          to: "user@example.com",
        }),
      }),
      userEmail: "user@example.com",
      userId: "user-123",
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
          { name: "From", value: "user@example.com" },
          { name: "To", value: "recipient@example.com" },
          { name: "Subject", value: "Test Email" },
          { name: "Date", value: "2024-01-01T00:00:00Z" },
        ],
        parts: [],
      },
    });

    await processHistoryItem(createHistoryItem(), createOptions());

    expect(blockUnsubscribedEmails).not.toHaveBeenCalled();
    expect(runColdEmailBlocker).not.toHaveBeenCalled();
  });

  it("should skip if email is unsubscribed", async () => {
    vi.mocked(blockUnsubscribedEmails).mockResolvedValueOnce(true);

    await processHistoryItem(createHistoryItem(), createOptions());

    expect(runColdEmailBlocker).not.toHaveBeenCalled();
  });

  it("should run cold email blocker when enabled", async () => {
    const options = createOptions({
      user: {
        ...defaultUser,
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
      },
      hasColdEmailAccess: true,
    });

    await processHistoryItem(createHistoryItem(), options);

    expect(runColdEmailBlocker).toHaveBeenCalledWith({
      email: expect.objectContaining({
        from: "sender@example.com",
        subject: "Test Email",
        content: expect.any(String),
        messageId: "123",
        threadId: "thread-123",
        date: expect.any(Date),
      }),
      gmail: options.gmail,
      user: options.user,
    });
  });

  it("should skip further processing if cold email is detected", async () => {
    vi.mocked(runColdEmailBlocker).mockResolvedValueOnce({
      isColdEmail: true,
      reason: "ai",
      aiReason: "This appears to be a cold email",
    });

    const options = createOptions({
      user: {
        ...defaultUser,
        coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
      },
      hasColdEmailAccess: true,
      hasAutomationRules: true,
      hasAiAutomationAccess: true,
      autoCategorizeSenders: true,
    });

    await processHistoryItem(createHistoryItem(), options);

    // Verify that further processing is skipped
    expect(categorizeSender).not.toHaveBeenCalled();
    expect(runRulesOnMessage).not.toHaveBeenCalled();
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
