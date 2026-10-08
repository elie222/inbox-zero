import { beforeEach, describe, expect, it, vi } from "vitest";
import { asSchema } from "ai";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/__mocks__/prisma";
import {
  createTestLogger,
  getEmailAccount,
  getMockMessage,
} from "@/__tests__/helpers";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";
import {
  forwardEmailTool,
  getAccountOverviewTool,
  getSenderCategorizationStatusTool,
  getSenderCategoryOverviewTool,
  manageInboxTool,
  manageSenderCategoryTool,
  replyEmailTool,
  searchInboxTool,
  sendEmailTool,
  startSenderCategorizationTool,
} from "./chat-inbox-tools";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/posthog", () => ({
  posthogCaptureEvent: vi.fn().mockResolvedValue(undefined),
}));

const {
  mockGenerateObject,
  mockArchiveCategory,
  mockGetCategoryOverview,
  mockStartBulkCategorization,
  mockGetCategorizationProgress,
  mockGetCategorizationStatusSnapshot,
  mockValidateUserAndAiAccess,
} = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockArchiveCategory: vi.fn(),
  mockGetCategoryOverview: vi.fn(),
  mockStartBulkCategorization: vi.fn(),
  mockGetCategorizationProgress: vi.fn(),
  mockGetCategorizationStatusSnapshot: vi.fn(),
  mockValidateUserAndAiAccess: vi.fn(),
}));

vi.mock("@/utils/llms", () => ({
  createGenerateObject: () => mockGenerateObject,
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({ model: {}, provider: "test", modelName: "test" })),
}));

vi.mock("@/utils/categorize/senders/archive-category", () => ({
  archiveCategory: (...args: Parameters<typeof mockArchiveCategory>) =>
    mockArchiveCategory(...args),
}));

vi.mock("@/utils/categorize/senders/get-category-overview", () => ({
  getCategoryOverview: (...args: Parameters<typeof mockGetCategoryOverview>) =>
    mockGetCategoryOverview(...args),
}));

vi.mock("@/utils/categorize/senders/start-bulk-categorization", () => ({
  startBulkCategorization: (
    ...args: Parameters<typeof mockStartBulkCategorization>
  ) => mockStartBulkCategorization(...args),
}));

vi.mock("@/utils/redis/categorization-progress", () => ({
  getCategorizationProgress: (
    ...args: Parameters<typeof mockGetCategorizationProgress>
  ) => mockGetCategorizationProgress(...args),
  getCategorizationStatusSnapshot: (
    ...args: Parameters<typeof mockGetCategorizationStatusSnapshot>
  ) => mockGetCategorizationStatusSnapshot(...args),
}));

vi.mock("@/utils/user/validate", () => ({
  validateUserAndAiAccess: (
    ...args: Parameters<typeof mockValidateUserAndAiAccess>
  ) => mockValidateUserAndAiAccess(...args),
}));

const TEST_EMAIL = "user@test.com";
const logger = createTestLogger();

describe("chat inbox tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateObject.mockReset();
    mockGenerateObject.mockResolvedValue({
      object: { content: "Thanks for the update." },
    });
  });

  it("adds formatted from header when sending an email", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "recipient@example.com",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "send_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      emailAccountId: "email-account-1",
      pendingAction: {
        to: "recipient@example.com",
        subject: "Hello",
        messageHtml: "<p>Hi there</p>",
        from: `Test User <${TEST_EMAIL}>`,
      },
    });
  });

  it("rejects sendEmail input when recipient has no email address", async () => {
    const toolInstance = sendEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      to: "Jack Cohen",
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
    });

    expect(result).toEqual({
      error: "Invalid sendEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("prepares threaded reply flow without sending immediately", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: TEST_EMAIL,
        subject: "Question",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    };

    const getMessage = vi.fn().mockResolvedValue(message);
    const replyToEmail = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage,
      replyToEmail,
    } as any);

    const toolInstance = replyEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      emailAccount: getEmailAccount(),
      messages: [{ role: "user", content: "Draft a reply thanking them." }],
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      content: "Thanks for the update.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(replyToEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "reply_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      emailAccountId: "email-account-1",
      pendingAction: {
        messageId: "message-1",
        content: "Thanks for the update.",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
      },
    });
  });

  it.each([
    {
      title: "matches an English email despite Portuguese chat and draft",
      request: "Prepare uma resposta confirmando que terça-feira funciona.",
      content: "Terça-feira funciona para mim.",
      translated: "Tuesday works for me.",
    },
    {
      title: "preserves an explicitly requested Spanish reply",
      request: "Prepare uma resposta em espanhol confirmando terça-feira.",
      content: "El martes me viene bien.",
      translated: "El martes me viene bien.",
    },
  ])("$title", async ({ request, content, translated }) => {
    const message = getMockMessage({
      id: "language-message",
      textPlain: "Would Tuesday work for our meeting?",
      textHtml: "",
    });
    const replyToEmail = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage: vi.fn().mockResolvedValue(message),
      replyToEmail,
    } as any);
    mockGenerateObject.mockResolvedValue({ object: { content: translated } });

    const toolInstance = replyEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      emailAccount: getEmailAccount(),
      messages: [{ role: "user", content: request }],
    });
    const result = await (toolInstance.execute as any)({
      messageId: message.id,
      content,
    });

    expect(result).toMatchObject({
      success: true,
      requiresConfirmation: true,
      pendingAction: { messageId: message.id, content: translated },
    });
    expect(mockGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(request),
      }),
    );
    expect(mockGenerateObject.mock.calls[0][0].prompt).toContain(
      message.textPlain,
    );
    expect(replyToEmail).not.toHaveBeenCalled();
  });

  it("does not offer an unchecked reply when language matching fails", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage: vi.fn().mockResolvedValue(
        getMockMessage({
          textPlain: "Would Tuesday work for our meeting?",
          textHtml: "",
        }),
      ),
    } as any);
    mockGenerateObject.mockRejectedValue(new Error("Translation unavailable"));

    const toolInstance = replyEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
      emailAccount: getEmailAccount(),
      messages: [{ role: "user", content: "Prepare uma resposta." }],
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      content: "Terça-feira funciona para mim.",
    });

    expect(result).toEqual({ error: "Failed to prepare reply" });
  });

  it("prepares forward flow without sending immediately", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue({
      name: "Test User",
      email: TEST_EMAIL,
    } as any);

    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "",
      historyId: "",
      inline: [],
      headers: {
        from: "contact@example.com",
        to: TEST_EMAIL,
        subject: "Question",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Question",
      date: "2026-02-18T00:00:00.000Z",
    };

    const getMessage = vi.fn().mockResolvedValue(message);
    const forwardEmail = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getMessage,
      forwardEmail,
    } as any);

    const toolInstance = forwardEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      to: "recipient@example.com",
      content: "Forwarding this along.",
    });

    expect(getMessage).toHaveBeenCalledWith("message-1");
    expect(forwardEmail).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      actionType: "forward_email",
      requiresConfirmation: true,
      confirmationState: "pending",
      emailAccountId: "email-account-1",
      pendingAction: {
        messageId: "message-1",
        to: "recipient@example.com",
        content: "Forwarding this along.",
      },
      reference: {
        messageId: "message-1",
        threadId: "thread-1",
      },
    });
  });

  it("rejects forwardEmail input when recipient has no email address", async () => {
    const toolInstance = forwardEmailTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      messageId: "message-1",
      to: "Jack Cohen",
      content: "Forwarding this along.",
    });

    expect(result).toEqual({
      error:
        "Invalid forwardEmail input: to must include valid email address(es)",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
  });

  it("resolves a label name before archiving threads", async () => {
    const archiveThreadWithLabel = vi.fn().mockResolvedValue(undefined);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "To-Delete",
      type: "user",
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      archiveThreadWithLabel,
      getLabelByName,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "archive_threads",
      labelName: "To-Delete",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("To-Delete");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(archiveThreadWithLabel).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      TEST_EMAIL,
      "Label_123",
    );
    expect(archiveThreadWithLabel).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      TEST_EMAIL,
      "Label_123",
    );
    expect(result).toMatchObject({
      action: "archive_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
    });
  });

  it("requires action-specific Gmail manageInbox fields", async () => {
    const schema = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    }).inputSchema as any;

    expect(
      schema.safeParse({
        action: "label_threads",
        threadIds: ["thread-1"],
        labelName: "Finance",
        read: false,
        fromEmails: ["_unused_"],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: "label_threads",
        threadIds: ["thread-1"],
        label: "Finance",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "archive_threads",
        threadIds: ["thread-1"],
        labelName: "Finance",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: "archive_threads",
        threadIds: ["thread-1"],
        label: "Finance",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "mark_read_threads",
        threadIds: ["thread-1"],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "mark_read_threads",
        threadIds: ["thread-1"],
        read: false,
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: "bulk_archive_senders",
        threadIds: ["thread-1"],
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "bulk_archive_senders",
        fromEmails: ["sender@example.com"],
        threadIds: ["thread-1"],
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: "bulk_archive_senders",
        fromEmails: ["sender@example.com"],
      }).success,
    ).toBe(true);
    const jsonSchema = await Promise.resolve(asSchema(schema).jsonSchema);
    expect(jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: { action: { type: "string" } },
    });
    expect(jsonSchema).not.toHaveProperty("oneOf");
    expect(jsonSchema).not.toHaveProperty("anyOf");
  });

  it("requires Outlook category fields without accepting Gmail taxonomy aliases", async () => {
    const schema = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    }).inputSchema as any;

    expect(
      schema.safeParse({
        action: "categorize_threads",
        threadIds: ["thread-1"],
        categoryName: "Finance",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: "categorize_threads",
        threadIds: ["thread-1"],
        category: "Finance",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "categorize_threads",
        threadIds: ["thread-1"],
        labelName: "Finance",
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        action: "archive_threads",
        threadIds: ["thread-1"],
        categoryName: "Finance",
      }).success,
    ).toBe(true);
    expect(
      schema.safeParse({
        action: "trash_threads",
        threadIds: ["thread-1"],
        categoryName: "Finance",
      }).success,
    ).toBe(true);
    const jsonSchema = await Promise.resolve(asSchema(schema).jsonSchema);
    expect(jsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["action"],
      properties: { action: { type: "string" } },
    });
    expect(jsonSchema).not.toHaveProperty("oneOf");
    expect(jsonSchema).not.toHaveProperty("anyOf");
  });

  it("resolves an exact labelName to the provider label before labeling threads", async () => {
    const getThreadMessages = vi.fn().mockImplementation(async (threadId) => [
      {
        id: `${threadId}-message-1`,
        threadId,
      },
      {
        id: `${threadId}-message-2`,
        threadId,
      },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(getThreadMessages).toHaveBeenNthCalledWith(1, "thread-1");
    expect(getThreadMessages).toHaveBeenNthCalledWith(2, "thread-2");
    expect(labelMessage).toHaveBeenCalledTimes(4);
    expect(labelMessage.mock.calls).toEqual(
      expect.arrayContaining([
        [
          {
            messageId: "thread-1-message-1",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-1-message-2",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-2-message-1",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
        [
          {
            messageId: "thread-2-message-2",
            labelId: "Label_123",
            labelName: "Finance",
          },
        ],
      ]),
    );
    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
      labelId: "Label_123",
      labelName: "Finance",
    });
  });

  it("throttles Gmail label_threads writes to small batches", async () => {
    const getThreadMessages = vi.fn().mockImplementation(async (threadId) => [
      {
        id: `${threadId}-message-1`,
        threadId,
      },
      {
        id: `${threadId}-message-2`,
        threadId,
      },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    let inFlight = 0;
    let maxInFlight = 0;
    const labelMessage = vi.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {};
    });

    vi.mocked(createEmailProvider).mockResolvedValue({
      name: "google",
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2", "thread-3"],
    });

    expect(result).toMatchObject({
      action: "label_threads",
      success: true,
      failedCount: 0,
      successCount: 3,
      requestedCount: 3,
    });
    expect(labelMessage).toHaveBeenCalledTimes(6);
    expect(maxInFlight).toBeLessThanOrEqual(3);
  });

  it("returns a descriptive error when label_threads receives an unknown labelName", async () => {
    const getThreadMessages = vi.fn();
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const getLabels = vi.fn().mockResolvedValue([]);
    const labelMessage = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      getLabels,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error:
        'Label "Finance" does not exist. Use createOrGetLabel first if you want to create it.',
      toolErrorVisibility: "hidden",
    });
    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(getLabels).toHaveBeenCalledWith({ includeHidden: true });
    expect(getThreadMessages).not.toHaveBeenCalled();
    expect(labelMessage).not.toHaveBeenCalled();
  });

  it("applies a unique nested Gmail label when given its leaf name", async () => {
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const getLabels = vi.fn().mockResolvedValue([
      { id: "Label_parent", name: "L3", type: "user" },
      { id: "Label_child", name: "L3/L4", type: "user" },
    ]);
    const getThreadMessages = vi
      .fn()
      .mockResolvedValue([{ id: "message-1", threadId: "thread-1" }]);
    const labelMessage = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      getLabels,
      getThreadMessages,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "L4",
      threadIds: ["thread-1"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("L4");
    expect(getLabels).toHaveBeenCalledWith({ includeHidden: true });
    expect(labelMessage).toHaveBeenCalledWith({
      messageId: "message-1",
      labelId: "Label_child",
      labelName: "L3/L4",
    });
    expect(result).toMatchObject({
      success: true,
      labelId: "Label_child",
      labelName: "L3/L4",
    });
  });

  it("does not apply an ambiguous nested Gmail leaf name", async () => {
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const getLabels = vi.fn().mockResolvedValue([
      { id: "Label_1", name: "L3/L4", type: "user" },
      { id: "Label_2", name: "Projects/L4", type: "user" },
    ]);
    const getThreadMessages = vi.fn();
    const labelMessage = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      getLabels,
      getThreadMessages,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "L4",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error:
        'Multiple Gmail labels match "L4": "L3/L4", "Projects/L4". Use the full label path.',
      toolErrorVisibility: "hidden",
    });
    expect(getThreadMessages).not.toHaveBeenCalled();
    expect(labelMessage).not.toHaveBeenCalled();
  });

  it("resolves an exact labelName before removing labels from threads", async () => {
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const removeThreadLabel = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      removeThreadLabel,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "remove_label_threads",
      labelName: "Finance",
      threadIds: ["thread-1", "thread-2"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabelByName).toHaveBeenCalledTimes(1);
    expect(removeThreadLabel).toHaveBeenNthCalledWith(
      1,
      "thread-1",
      "Label_123",
    );
    expect(removeThreadLabel).toHaveBeenNthCalledWith(
      2,
      "thread-2",
      "Label_123",
    );
    expect(result).toMatchObject({
      action: "remove_label_threads",
      success: true,
      failedCount: 0,
      successCount: 2,
      requestedCount: 2,
      labelId: "Label_123",
      labelName: "Finance",
    });
  });

  it("returns a transparent error when removing a label that does not exist", async () => {
    const getLabelByName = vi.fn().mockResolvedValue(null);
    const getLabels = vi.fn().mockResolvedValue([]);
    const removeThreadLabel = vi.fn();

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      getLabels,
      removeThreadLabel,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "remove_label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toEqual({
      error: 'Label "Finance" does not exist, so no label was removed.',
      toolErrorVisibility: "hidden",
    });
    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(getLabels).toHaveBeenCalledWith({ includeHidden: true });
    expect(removeThreadLabel).not.toHaveBeenCalled();
  });

  it("removes Outlook categories using category wording in the tool contract", async () => {
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "category-123",
      name: "Finance",
      type: "user",
    });
    const removeThreadLabel = vi.fn().mockResolvedValue(undefined);

    vi.mocked(createEmailProvider).mockResolvedValue({
      getLabelByName,
      removeThreadLabel,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "remove_category_threads",
      categoryName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(getLabelByName).toHaveBeenCalledWith("Finance");
    expect(removeThreadLabel).toHaveBeenCalledWith("thread-1", "category-123");
    expect(result).toMatchObject({
      action: "remove_category_threads",
      success: true,
      categoryId: "category-123",
      categoryName: "Finance",
    });
  });

  it("marks a thread labeling action as failed when any message label call fails", async () => {
    const getThreadMessages = vi.fn().mockResolvedValue([
      { id: "thread-1-message-1", threadId: "thread-1" },
      { id: "thread-1-message-2", threadId: "thread-1" },
    ]);
    const getLabelByName = vi.fn().mockResolvedValue({
      id: "Label_123",
      name: "Finance",
      type: "user",
    });
    const labelMessage = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("label failed"));

    vi.mocked(createEmailProvider).mockResolvedValue({
      getThreadMessages,
      getLabelByName,
      labelMessage,
    } as any);

    const toolInstance = manageInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "label_threads",
      labelName: "Finance",
      threadIds: ["thread-1"],
    });

    expect(result).toMatchObject({
      action: "label_threads",
      success: false,
      failedCount: 1,
      successCount: 0,
      requestedCount: 1,
      failedThreadIds: ["thread-1"],
    });
  });
});

function serializeToolContract(toolInstance: {
  description?: string;
  inputSchema?: unknown;
}) {
  return [
    toolInstance.description,
    ...collectSchemaDescriptions(toolInstance.inputSchema),
  ]
    .filter(Boolean)
    .join("\n");
}

function collectSchemaDescriptions(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];

  const schemaObject = schema as {
    description?: string;
    def?: {
      shape?: Record<string, unknown>;
      innerType?: unknown;
      element?: unknown;
      in?: unknown;
      out?: unknown;
      options?: unknown[];
    };
  };
  const descriptions = schemaObject.description
    ? [schemaObject.description]
    : [];
  const def = schemaObject.def;

  if (def?.shape) {
    for (const value of Object.values(def.shape)) {
      descriptions.push(...collectSchemaDescriptions(value));
    }
  }

  for (const value of [def?.innerType, def?.element, def?.in, def?.out]) {
    descriptions.push(...collectSchemaDescriptions(value));
  }

  for (const option of def?.options ?? []) {
    descriptions.push(...collectSchemaDescriptions(option));
  }

  return descriptions;
}

describe("chat inbox tools - bulk pagination guidance (INB-134)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    [
      { folderName: "Marketing" },
      { folderId: "marketing-folder", labelId: undefined },
      7,
    ],
    [
      { categoryName: "Marketing" },
      { folderId: undefined, labelId: "Marketing" },
      37,
    ],
    [
      { folderName: "Marketing", categoryName: "Marketing" },
      { folderId: "marketing-folder", labelId: "Marketing" },
      3,
    ],
  ])("searchInbox exposes an exact Outlook scope count for %j instead of a page count", async (scope, expectedScope, count) => {
    const countMessages = vi.fn().mockResolvedValue(count);
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [getMockMessage({ id: "message-1" })],
      nextPageToken: "NEXT_PAGE",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      countMessages,
      searchMessages,
      getLabels: vi
        .fn()
        .mockResolvedValue([
          { id: "marketing-category", name: "Marketing", type: "user" },
        ]),
      getFolders: vi.fn().mockResolvedValue([
        {
          id: "marketing-folder",
          displayName: "Marketing",
          childFolders: [],
        },
      ]),
    } as any);
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });
    const result = await (toolInstance.execute as any)({
      query: "",
      limit: 20,
      ...scope,
    });

    expect(result).toMatchObject({
      exactCount: count,
      totalReturned: 1,
      hasMore: true,
    });
    expect(countMessages).toHaveBeenCalledExactlyOnceWith(expectedScope);
    expect(searchMessages.mock.calls[0][0].folderId).toBe(
      expectedScope.folderId,
    );
    expect(searchMessages.mock.calls[0][0].labelName).toBe(
      expectedScope.labelId,
    );
  });

  it("searchInbox returns exact zero for an empty Outlook folder", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      countMessages: vi.fn().mockResolvedValue(0),
      searchMessages: vi.fn().mockResolvedValue({ messages: [] }),
      getLabels: vi.fn().mockResolvedValue([]),
      getFolders: vi
        .fn()
        .mockResolvedValue([
          { id: "empty-folder", displayName: "Empty", childFolders: [] },
        ]),
    } as any);
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });
    const result = await (toolInstance.execute as any)({
      query: "",
      limit: 20,
      folderName: "Empty",
    });

    expect(result).toMatchObject({ exactCount: 0, totalReturned: 0 });
  });

  it("searchInbox preserves search results and discloses an unavailable exact count", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      countMessages: vi.fn().mockRejectedValue(new Error("Count unavailable")),
      searchMessages: vi
        .fn()
        .mockResolvedValue({ messages: [getMockMessage({ id: "message-1" })] }),
      getLabels: vi.fn().mockResolvedValue([]),
    } as any);
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });
    const result = await (toolInstance.execute as any)({
      query: "",
      limit: 20,
      categoryName: "Marketing",
    });

    expect(result).toMatchObject({
      totalReturned: 1,
      countError: "Exact message count unavailable",
    });
    expect(result).not.toHaveProperty("exactCount");
  });

  it.each([
    { query: "invoice", categoryName: "Marketing" },
    { query: "", categoryName: "Marketing", readState: "unread" },
    { query: "", categoryName: "Marketing", fromEmail: "sender@example.com" },
    { query: "", categoryName: "Marketing", pageToken: "NEXT_PAGE" },
    { query: "invoice" },
  ])("searchInbox does not add scope-only counts to filtered or paginated searches: %j", async (input) => {
    const countMessages = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      countMessages,
      searchMessages: vi.fn().mockResolvedValue({ messages: [] }),
      getLabels: vi.fn().mockResolvedValue([]),
    } as any);
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });
    const result = await (toolInstance.execute as any)({ limit: 20, ...input });

    expect(result).not.toHaveProperty("exactCount");
    expect(countMessages).not.toHaveBeenCalled();
  });

  it("searchInbox result signals when more pages remain (hasMore)", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [
          {
            id: "m1",
            threadId: "t1",
            snippet: "",
            historyId: "",
            inline: [],
            headers: {
              from: "a@b.com",
              to: TEST_EMAIL,
              subject: "hi",
              date: "2026-01-01T00:00:00.000Z",
            },
            subject: "hi",
            textPlain: "",
            textHtml: "",
            labelIds: [],
            internalDate: "0",
          },
        ],
        nextPageToken: "PAGE_TOKEN_2",
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "older_than:3y is:unread",
      limit: 20,
    });

    expect(result.nextPageToken).toBe("PAGE_TOKEN_2");
    expect(result.hasMore).toBe(true);
  });

  it("searchInbox uses the capped default page size when limit is omitted", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "m1",
          threadId: "t1",
          snippet: "",
          historyId: "",
          inline: [],
          headers: {
            from: "a@b.com",
            to: TEST_EMAIL,
            subject: "hi",
            date: "2026-01-01T00:00:00.000Z",
          },
          subject: "hi",
          textPlain: "",
          textHtml: "",
          labelIds: [],
          internalDate: "0",
        },
      ],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "older_than:3y is:unread",
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "older_than:3y is:unread",
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("searchInbox clamps out-of-range limits instead of rejecting them", async () => {
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const schema = toolInstance.inputSchema as any;

    expect(schema.parse({ query: "is:unread", limit: 100 }).limit).toBe(20);
    expect(schema.parse({ query: "is:unread", limit: 0 }).limit).toBe(1);
    expect(schema.parse({ query: "is:unread" }).limit).toBe(20);
  });

  it("searchInbox returns provider failure feedback the model can act on", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockRejectedValue({
        status: 429,
        message: "Rate limit exceeded",
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "is:unread",
      limit: 20,
    });

    expect(result.error).toBe("Failed to search inbox");
    expect(result.searchFeedback).toMatchObject({
      status: 429,
      message: "Rate limit exceeded",
      retryable: true,
    });
  });

  it("searchInbox result reports hasMore=false when no more pages", async () => {
    (createEmailProvider as any).mockResolvedValue({
      searchMessages: vi.fn().mockResolvedValue({
        messages: [],
        nextPageToken: undefined,
      }),
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "older_than:10y",
      limit: 20,
    });

    expect(result.hasMore).toBe(false);
  });

  it("searchInbox uses exact Outlook sender filtering for fielded sender queries", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "m1",
          threadId: "t1",
          snippet: "Can you take a look?",
          historyId: "",
          inline: [],
          headers: {
            from: "sender@example.com",
            to: TEST_EMAIL,
            subject: "Review request",
            date: "2026-01-01T00:00:00.000Z",
          },
          subject: "Review request",
          textPlain: "",
          textHtml: "",
          labelIds: [],
          internalDate: "0",
        },
      ],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      fromEmail: "sender@example.com",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.queryUsed).toBe("from:sender@example.com");
  });

  it("searchInbox uses exact Outlook sender filtering for quoted sender queries", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [
        {
          id: "m1",
          threadId: "t1",
          snippet: "Can you take a look?",
          historyId: "",
          inline: [],
          headers: {
            from: "Sender <sender@example.com>",
            to: TEST_EMAIL,
            subject: "Review request",
            date: "2026-01-01T00:00:00.000Z",
          },
          subject: "Review request",
          textPlain: "",
          textHtml: "",
          labelIds: [],
          internalDate: "0",
        },
      ],
      nextPageToken: "PAGE_TOKEN_2",
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'from:"sender@example.com"',
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      fromEmail: "sender@example.com",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(result.queryUsed).toBe("from:sender@example.com");
    expect(result.nextPageToken).toBe("PAGE_TOKEN_2");
    expect(result.hasMore).toBe(true);
  });

  it("rejects conflicting exact Outlook sender filters without searching", async () => {
    const searchMessages = vi.fn();
    vi.mocked(createEmailProvider).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    } as any);
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:first@example.com",
      fromEmail: "second@example.com",
    });

    expect(searchMessages).not.toHaveBeenCalled();
    expect(result.error).toBe("Failed to search inbox");
    expect(result.microsoftSearchFeedback.attempts[0].message).toBe(
      "Sender filters conflict. Use one exact sender address.",
    );
  });

  it("searchInbox forwards explicit Outlook sender filters across pages", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      fromEmail: "sender@example.com",
      limit: 20,
      pageToken: "PAGE_TOKEN_2",
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      fromEmail: "sender@example.com",
      maxResults: 20,
      pageToken: "PAGE_TOKEN_2",
      readState: undefined,
      labelName: undefined,
    });
  });

  it("searchInbox preserves structured Outlook sender filters when skipping empty pages", async () => {
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: "PAGE_TOKEN_2",
      })
      .mockResolvedValueOnce({
        messages: [
          {
            id: "m1",
            threadId: "t1",
            externalUrl:
              "https://outlook.office.com/mail/deeplink/read/m1?ispopout=0",
            snippet: "Can you take a look?",
            historyId: "",
            inline: [],
            headers: {
              from: "Sender <sender@example.com>",
              to: TEST_EMAIL,
              subject: "Review request",
              date: "2026-01-01T00:00:00.000Z",
            },
            subject: "Review request",
            textPlain: "",
            textHtml: "",
            labelIds: [],
            internalDate: "0",
          },
        ],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      fromEmail: "sender@example.com",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: "",
      fromEmail: "sender@example.com",
      maxResults: 20,
      pageToken: "PAGE_TOKEN_2",
      readState: undefined,
      labelName: undefined,
    });
    expect(result.messages).toHaveLength(1);
    expect(result.queryUsed).toBe("from:sender@example.com");
    expect(result.messages[0].externalUrl).toBe(
      "https://outlook.office.com/mail/deeplink/read/m1?ispopout=0",
    );
  });

  it("searchInbox resolves a folder independently of a same-named category across all pages", async () => {
    const messages = Array.from({ length: 24 }, (_, index) =>
      getMockMessage({
        id: `folder-message-${index + 1}`,
        threadId: `folder-thread-${index + 1}`,
        from: "digest@example.com",
        labelIds: ["UNREAD"],
      }),
    );
    const searchMessages = vi.fn().mockImplementation(async (options) => {
      if (options.folderId !== "newsletter-folder" || options.labelName) {
        return { messages: [], nextPageToken: undefined };
      }
      if (!options.pageToken) {
        return {
          messages: messages.slice(0, 11),
          nextPageToken: "PAGE_TOKEN_2",
        };
      }
      if (options.pageToken === "PAGE_TOKEN_2") {
        return { messages: [], nextPageToken: "PAGE_TOKEN_3" };
      }
      return { messages: messages.slice(11), nextPageToken: undefined };
    });
    const markReadThread = vi.fn().mockImplementation(async (threadId) => {
      if (threadId === "folder-thread-24")
        throw new Error("Mock write failure");
    });
    const getFolders = vi.fn().mockResolvedValue([
      {
        id: "newsletter-folder",
        displayName: "Newsletter",
        childFolders: [],
      },
    ]);
    vi.mocked(createEmailProvider).mockResolvedValue({
      searchMessages,
      getFolders,
      getLabels: vi
        .fn()
        .mockResolvedValue([
          { id: "newsletter-category", name: "Newsletter", type: "user" },
        ]),
      markReadThread,
    } as any);
    const options = {
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    };
    const search = searchInboxTool(options);
    const schema = search.inputSchema as any;
    const parsedInput = schema.safeParse({ folderName: "Newsletter" });
    expect(parsedInput.success).toBe(true);

    const threadIds = new Set<string>();
    let pageToken: string | undefined;
    let pages = 0;
    do {
      const result: any = await (search.execute as any)({
        query: "",
        folderName: "Newsletter",
        readState: "unread",
        limit: 20,
        pageToken,
      });
      expect(result.error).toBeUndefined();
      for (const message of result.messages) threadIds.add(message.threadId);
      pageToken = result.nextPageToken;
      pages += 1;
      expect(pages).toBeLessThanOrEqual(3);
      expect(result.hasMore).toBe(Boolean(pageToken));
    } while (pageToken);

    expect(threadIds.size).toBe(24);
    expect(searchMessages).toHaveBeenCalledTimes(3);
    expect(markReadThread).not.toHaveBeenCalled();
    const result = await (manageInboxTool(options).execute as any)({
      action: "mark_read_threads",
      threadIds: [...threadIds],
      read: true,
    });
    expect(markReadThread).toHaveBeenCalledTimes(24);
    expect(result).toMatchObject({
      success: false,
      requestedCount: 24,
      successCount: 23,
      failedCount: 1,
      failedThreadIds: ["folder-thread-24"],
    });
    expect(
      searchMessages.mock.calls.every(
        ([input]) =>
          input.folderId === "newsletter-folder" &&
          input.labelName === undefined &&
          input.readState === "unread",
      ),
    ).toBe(true);
  });

  it("searchInbox passes structured Outlook category and read-state filters", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "",
      categoryName: "Newsletter",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Newsletter",
    });
  });

  it("uses Outlook category wording in model-visible inbox tool contracts", () => {
    const toolOptions = {
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    };

    const contractText = [
      getAccountOverviewTool(toolOptions),
      searchInboxTool(toolOptions),
      manageInboxTool(toolOptions),
    ]
      .map(serializeToolContract)
      .join("\n");

    expect(contractText).toMatch(/\bcategory\b/i);
    expect(contractText).not.toMatch(/\blabels?\b/i);
  });

  it("keeps sender validation without exposing unsupported regex patterns", async () => {
    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });
    const schema = toolInstance.inputSchema as any;
    expect(schema.safeParse({ fromEmail: "sender@example.com" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ fromEmail: "invalid-address" }).success).toBe(
      false,
    );
    const jsonSchema = await Promise.resolve(asSchema(schema).jsonSchema);
    expect(JSON.stringify(jsonSchema.properties?.fromEmail)).not.toContain(
      '"pattern"',
    );
  });

  it("uses provider-specific sender search contracts", () => {
    const toolOptions = {
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    };
    const gmailTool = searchInboxTool({
      ...toolOptions,
      provider: "google",
    });
    const outlookTool = searchInboxTool({
      ...toolOptions,
      provider: "microsoft",
    });
    const gmailSchema = gmailTool.inputSchema as {
      def?: { shape?: Record<string, unknown> };
    };
    const outlookSchema = outlookTool.inputSchema as {
      def?: { shape?: Record<string, unknown> };
    };

    expect(Object.keys(gmailSchema.def?.shape ?? {})).not.toContain(
      "fromEmail",
    );
    expect(Object.keys(outlookSchema.def?.shape ?? {})).toContain("fromEmail");
    expect(serializeToolContract(gmailTool)).toContain(
      "Use from:person@example.com for an exact sender search",
    );
    expect(serializeToolContract(outlookTool)).toContain(
      "Exact sender email address",
    );
  });

  it("searchInbox keeps bare Outlook text queries as text", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "Operations folder unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "Operations folder",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: undefined,
    });
  });

  it("searchInbox removes redundant Outlook read-state terms before scope normalization", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "newsletter unread",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "newsletter",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: undefined,
    });
  });

  it("searchInbox normalizes Outlook folder field queries before provider search", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
      getFolders: vi
        .fn()
        .mockResolvedValue([
          { id: "scoped-folder", displayName: "Operations", childFolders: [] },
        ]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    await (toolInstance.execute as any)({
      query: 'folder:"Operations"',
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: undefined,
      folderId: "scoped-folder",
    });
  });

  it("searchInbox advances through empty Outlook filtered pages", async () => {
    const message: ParsedMessage = {
      id: "message-1",
      threadId: "thread-1",
      snippet: "A scoped update",
      historyId: "",
      inline: [],
      headers: {
        from: "updates@example.com",
        to: TEST_EMAIL,
        subject: "Scoped update",
        date: "2026-02-18T00:00:00.000Z",
      },
      subject: "Scoped update",
      date: "2026-02-18T00:00:00.000Z",
      labelIds: ["UNREAD", "Operations"],
    };
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: "PAGE_TOKEN_2",
      })
      .mockResolvedValueOnce({
        messages: [message],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "",
      categoryName: "Operations",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: "unread",
      labelName: "Operations",
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: "",
      maxResults: 20,
      pageToken: "PAGE_TOKEN_2",
      readState: "unread",
      labelName: "Operations",
    });
    expect(result.messages).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  it("searchInbox preserves an empty Outlook folder scope", async () => {
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      })
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
      getFolders: vi
        .fn()
        .mockResolvedValue([
          { id: "scoped-folder", displayName: "invoice", childFolders: [] },
        ]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'folder:"invoice"',
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
      folderId: "scoped-folder",
    });
    expect(searchMessages).toHaveBeenCalledTimes(1);
    expect(result.queryUsed).toBe("");
  });

  it("searchInbox preserves Outlook scope after empty structured pages end", async () => {
    const searchMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: "PAGE_TOKEN_2",
      })
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      })
      .mockResolvedValueOnce({
        messages: [],
        nextPageToken: undefined,
      });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
      getFolders: vi
        .fn()
        .mockResolvedValue([
          { id: "scoped-folder", displayName: "invoice", childFolders: [] },
        ]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'folder:"invoice"',
      limit: 20,
    });

    expect(searchMessages).toHaveBeenNthCalledWith(1, {
      query: "",
      maxResults: 20,
      pageToken: undefined,
      readState: undefined,
      labelName: undefined,
      folderId: "scoped-folder",
    });
    expect(searchMessages).toHaveBeenNthCalledWith(2, {
      query: "",
      maxResults: 20,
      pageToken: "PAGE_TOKEN_2",
      readState: undefined,
      labelName: undefined,
      folderId: "scoped-folder",
    });
    expect(searchMessages).toHaveBeenCalledTimes(2);
    expect(result.queryUsed).toBe("");
  });

  it("searchInbox does not pass structured Outlook filters to Google", async () => {
    const searchMessages = vi.fn().mockResolvedValue({
      messages: [],
      nextPageToken: undefined,
    });

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    await (toolInstance.execute as any)({
      query: "newsletter",
      fromEmail: "sender@example.com",
      labelName: "Newsletter",
      readState: "unread",
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith({
      query: "newsletter",
      maxResults: 20,
      pageToken: undefined,
    });
  });

  it("searchInbox returns structured Microsoft failure feedback when every attempt fails", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'from:sender@example.com subject:"weekly report"',
      limit: 20,
    });

    expect(result).toMatchObject({
      error: "Failed to search inbox",
      provider: "microsoft",
      microsoftSearchFeedback: {
        failureType: "query_failed",
        fallbackAttempted: true,
      },
    });
    expect(result.microsoftSearchFeedback.attempts.length).toBeGreaterThan(1);
    expect(searchMessages).toHaveBeenCalledTimes(
      result.microsoftSearchFeedback.attempts.length,
    );
  });

  it("searchInbox suggests concrete simpler retries for complex Microsoft queries", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: 'unread sender@example.com subject:"weekly site report"',
      limit: 20,
    });

    expect(result.microsoftSearchFeedback).toMatchObject({
      failureType: "query_failed",
      likelyCause:
        "The failed query mixed a read-state term with other filters. Retry with one simpler clause.",
      removedTerms: ["unread"],
      retryQueries: ['subject:"weekly site report"', '"weekly site report"'],
    });
    expect(searchMessages).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        query: "sender@example.com",
      }),
    );
  });

  it("searchInbox preserves backslashes when generating Microsoft keyword retry queries", async () => {
    const searchMessages = vi.fn().mockRejectedValue(
      Object.assign(new Error("Unsupported search clause"), {
        statusCode: 400,
        code: "BadRequest",
      }),
    );

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "microsoft",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: String.raw`subject:"Folder \ Review" unread`,
      limit: 20,
    });

    expect(searchMessages).toHaveBeenCalledWith(
      expect.objectContaining({ query: String.raw`"Folder \\ Review"` }),
    );
    expect(result.microsoftSearchFeedback.retryQueries).not.toContain(
      String.raw`"Folder \\ Review"`,
    );
  });

  it("searchInbox reports non-retryable Google failures with the failure detail", async () => {
    const searchMessages = vi
      .fn()
      .mockRejectedValue(new Error("Search syntax failed"));

    (createEmailProvider as any).mockResolvedValue({
      searchMessages,
      getLabels: vi.fn().mockResolvedValue([]),
    });

    const toolInstance = searchInboxTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result: any = await (toolInstance.execute as any)({
      query: "from:sender@example.com",
      limit: 20,
    });

    expect(result.queryUsed).toBe("from:sender@example.com");
    expect(result.error).toBe("Failed to search inbox");
    expect(result.searchFeedback).toMatchObject({
      message: "Search syntax failed",
      retryable: false,
    });
    expect(searchMessages).toHaveBeenCalledTimes(1);
  });
});

describe("chat inbox tools - sender categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockValidateUserAndAiAccess.mockResolvedValue(undefined);
  });

  it("getSenderCategoryOverview returns the shared overview payload", async () => {
    mockGetCategoryOverview.mockResolvedValue({
      autoCategorizeSenders: true,
      categorization: {
        status: "completed",
        totalItems: 4,
        completedItems: 4,
        remainingItems: 0,
        message: "Sender categorization completed for 4 senders.",
      },
      categorizedSenderCount: 12,
      uncategorizedSenderCount: 3,
      categories: [],
    });

    const toolInstance = getSenderCategoryOverviewTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(mockGetCategoryOverview).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(result.categorizedSenderCount).toBe(12);
  });

  it("startSenderCategorization delegates to the shared start helper", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      provider: "google",
    } as any);
    mockStartBulkCategorization.mockResolvedValue({
      started: true,
      alreadyRunning: false,
      totalQueuedSenders: 8,
      autoCategorizeSenders: true,
      progress: {
        status: "running",
        totalItems: 8,
        completedItems: 0,
        remainingItems: 8,
        message: "Categorizing senders: 0 of 8 completed.",
      },
    });

    const toolInstance = startSenderCategorizationTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(mockValidateUserAndAiAccess).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(createEmailProvider).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });
    expect(mockStartBulkCategorization).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      emailProvider: { provider: "google" },
      logger,
    });
    expect(result.totalQueuedSenders).toBe(8);
  });

  it("startSenderCategorization reports an AI access error before queuing work", async () => {
    mockValidateUserAndAiAccess.mockRejectedValue(
      new SafeError("Please upgrade for AI access"),
    );

    const toolInstance = startSenderCategorizationTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({});

    expect(result).toEqual({ error: "Please upgrade for AI access" });
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(mockStartBulkCategorization).not.toHaveBeenCalled();
  });

  it("getSenderCategorizationStatus waits briefly before reading progress", async () => {
    vi.useFakeTimers();
    mockGetCategorizationProgress.mockResolvedValue({
      totalItems: 8,
      completedItems: 3,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    const toolInstance = getSenderCategorizationStatusTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const resultPromise = (toolInstance.execute as any)({ waitMs: 250 });

    await vi.advanceTimersByTimeAsync(250);

    const result = await resultPromise;

    expect(mockGetCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(result).toEqual({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    vi.useRealTimers();
  });

  it("getSenderCategorizationStatus caps waitMs at 1500", async () => {
    vi.useFakeTimers();
    mockGetCategorizationProgress.mockResolvedValue({
      totalItems: 8,
      completedItems: 3,
      status: "running",
      startedAt: "2026-04-16T00:00:00.000Z",
      updatedAt: "2026-04-16T00:01:00.000Z",
    });
    mockGetCategorizationStatusSnapshot.mockReturnValue({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    const toolInstance = getSenderCategorizationStatusTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      logger,
    });

    const resultPromise = (toolInstance.execute as any)({ waitMs: 2000 });

    await vi.advanceTimersByTimeAsync(1499);
    expect(mockGetCategorizationProgress).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);

    const result = await resultPromise;

    expect(mockGetCategorizationProgress).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
    });
    expect(result).toEqual({
      status: "running",
      totalItems: 8,
      completedItems: 3,
      remainingItems: 5,
      message: "Categorizing senders: 3 of 8 completed.",
    });

    vi.useRealTimers();
  });

  it("manageSenderCategory delegates to the archive helper", async () => {
    vi.mocked(createEmailProvider).mockResolvedValue({
      provider: "google",
    } as any);
    mockArchiveCategory.mockResolvedValue({
      success: true,
      action: "archive_category",
      category: { id: "cat-1", name: "Newsletters" },
      sendersCount: 6,
      senders: ["one@example.com"],
      message: 'Archived mail from 6 senders in "Newsletters".',
    });

    const toolInstance = manageSenderCategoryTool({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      provider: "google",
      logger,
    });

    const result = await (toolInstance.execute as any)({
      action: "archive_category",
      categoryId: "cat-1",
    });

    expect(mockArchiveCategory).toHaveBeenCalledWith({
      email: TEST_EMAIL,
      emailAccountId: "email-account-1",
      emailProvider: { provider: "google" },
      logger,
      categoryId: "cat-1",
      categoryName: undefined,
    });
    expect(result.sendersCount).toBe(6);
  });
});
