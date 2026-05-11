import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionType, AttachmentSourceType } from "@/generated/prisma/enums";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { runActionFunction } from "@/utils/ai/actions";
import {
  resolveDraftAttachments,
  selectDraftAttachmentsForRule,
} from "@/utils/attachments/draft-attachments";
import {
  getMessagingRuleNotificationResult,
  sendMessagingRuleNotification,
} from "@/utils/messaging/rule-notifications";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/attachments/draft-attachments", () => ({
  resolveDraftAttachments: vi.fn().mockResolvedValue([]),
  selectDraftAttachmentsForRule: vi.fn().mockResolvedValue({
    selectedAttachments: [],
    attachmentContext: null,
  }),
}));

vi.mock("@/utils/messaging/rule-notifications", () => ({
  getMessagingRuleNotificationResult: vi.fn().mockResolvedValue({
    delivered: true,
    kind: "interactive",
  }),
  sendMessagingRuleNotification: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedAction: {
      update: vi.fn().mockResolvedValue({}),
    },
  },
}));

describe("runActionFunction", () => {
  const logger = createTestLogger();
  const emailAccount = {
    email: "user@example.com",
    id: "account-1",
    userId: "user-1",
  };
  const email = {
    id: "message-1",
    threadId: "thread-1",
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Property documents",
      date: "2026-01-01T12:00:00.000Z",
      "message-id": "<message-1@example.com>",
    },
    textPlain: "Please send the lease packet.",
    textHtml: "<p>Please send the lease packet.</p>",
    snippet: "",
    attachments: [],
    internalDate: "1700000000000",
  } as ParsedMessage;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.executedAction.update).mockResolvedValue({});
    vi.mocked(getMessagingRuleNotificationResult).mockResolvedValue({
      delivered: true,
      kind: "interactive",
    });
  });

  it("passes resolved drive attachments into draft creation", async () => {
    const client = createMockEmailProvider();

    vi.mocked(resolveDraftAttachments).mockResolvedValue([
      {
        filename: "lease.pdf",
        content: Buffer.from("pdf"),
        contentType: "application/pdf",
      },
    ]);

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        content: "Attached the requested PDF.",
        selectedAttachments: [
          {
            driveConnectionId: "drive-1",
            fileId: "file-1",
            filename: "lease.pdf",
            mimeType: "application/pdf",
            reason: "Matched the requested property",
          },
        ],
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(resolveDraftAttachments).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      userId: "user-1",
      selectedAttachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "lease.pdf",
          mimeType: "application/pdf",
          reason: "Matched the requested property",
        },
      ],
      logger: expect.anything(),
    });

    expect(client.draftEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Attached the requested PDF.",
        attachments: [
          expect.objectContaining({
            filename: "lease.pdf",
            contentType: "application/pdf",
          }),
        ],
      }),
      emailAccount.email,
      expect.objectContaining({ id: "executed-rule-1" }),
    );
  });

  it("skips draft attachments when no selected attachments were persisted", async () => {
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        content: "Attached the requested PDF.",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(selectDraftAttachmentsForRule).not.toHaveBeenCalled();
    expect(resolveDraftAttachments).not.toHaveBeenCalled();
    expect(client.draftEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        content: "Attached the requested PDF.",
        attachments: [],
      }),
      emailAccount.email,
      expect.objectContaining({ id: "executed-rule-1" }),
    );
  });

  it("sends chat drafts through the messaging notification path", async () => {
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_MESSAGING_CHANNEL,
        messagingChannelId: "channel-1",
        content: "Draft in chat",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(sendMessagingRuleNotification).toHaveBeenCalledWith({
      executedActionId: "action-1",
      email,
      logger: expect.anything(),
    });
    expect(client.draftEmail).not.toHaveBeenCalled();
  });

  it("keeps legacy messaging-targeted mailbox drafts on the Slack notification path", async () => {
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        messagingChannelId: "channel-1",
        content: "Draft in chat",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
        actionItems: [{ type: ActionType.DRAFT_EMAIL }],
      } as any,
      logger,
    });

    expect(client.draftEmail).not.toHaveBeenCalled();
  });

  it("falls back to mailbox drafts when legacy chat delivery is unavailable", async () => {
    const client = createMockEmailProvider();
    vi.mocked(getMessagingRuleNotificationResult).mockResolvedValueOnce({
      delivered: false,
      kind: "none",
    });

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        messagingChannelId: "channel-1",
        content: "Draft in chat",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
        actionItems: [{ type: ActionType.DRAFT_EMAIL }],
      } as any,
      logger,
    });

    expect(client.draftEmail).toHaveBeenCalled();
  });

  it("still creates mailbox drafts when linked providers only send a view-only message", async () => {
    const client = createMockEmailProvider();
    vi.mocked(getMessagingRuleNotificationResult).mockResolvedValueOnce({
      delivered: true,
      kind: "view_only",
    });

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        messagingChannelId: "channel-1",
        content: "Draft in chat",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
        actionItems: [{ type: ActionType.DRAFT_EMAIL }],
      } as any,
      logger,
    });

    expect(client.draftEmail).toHaveBeenCalled();
  });

  it("throws when chat draft delivery cannot be completed", async () => {
    const client = createMockEmailProvider();
    vi.mocked(sendMessagingRuleNotification).mockResolvedValueOnce(false);

    await expect(
      runActionFunction({
        client,
        email,
        action: {
          id: "action-1",
          type: ActionType.DRAFT_MESSAGING_CHANNEL,
          messagingChannelId: "channel-1",
          content: "Draft in chat",
        },
        emailAccount,
        executedRule: {
          id: "executed-rule-1",
          threadId: "thread-1",
          emailAccountId: "account-1",
          ruleId: "rule-1",
        } as any,
        logger,
      }),
    ).rejects.toThrow("Failed to deliver DRAFT_MESSAGING_CHANNEL notification");
  });

  it("sends NOTIFY_MESSAGING_CHANNEL actions through the messaging notification path", async () => {
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.NOTIFY_MESSAGING_CHANNEL,
        messagingChannelId: "channel-1",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(sendMessagingRuleNotification).toHaveBeenCalledWith({
      executedActionId: "action-1",
      email,
      logger: expect.anything(),
    });
  });

  it("stars the matched message for STAR actions", async () => {
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.STAR,
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(client.starMessage).toHaveBeenCalledWith("message-1");
  });

  it("throws when notify messaging actions are missing a channel id", async () => {
    const client = createMockEmailProvider();

    await expect(
      runActionFunction({
        client,
        email,
        action: {
          id: "action-1",
          type: ActionType.NOTIFY_MESSAGING_CHANNEL,
          messagingChannelId: null,
        },
        emailAccount,
        executedRule: {
          id: "executed-rule-1",
          threadId: "thread-1",
          emailAccountId: "account-1",
          ruleId: "rule-1",
        } as any,
        logger,
      }),
    ).rejects.toThrow("Missing messaging channel for NOTIFY_MESSAGING_CHANNEL");
  });

  it("passes static attachments into replies", async () => {
    const client = createMockEmailProvider();

    vi.mocked(resolveDraftAttachments).mockResolvedValue([
      {
        filename: "lease.pdf",
        content: Buffer.from("pdf"),
        contentType: "application/pdf",
      },
    ]);

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.REPLY,
        content: "Attached.",
        staticAttachments: [
          {
            driveConnectionId: "drive-1",
            name: "lease.pdf",
            sourceId: "file-1",
            sourcePath: "/Docs",
            type: AttachmentSourceType.FILE,
          },
        ],
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(resolveDraftAttachments).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      userId: "user-1",
      selectedAttachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "lease.pdf",
          mimeType: "application/pdf",
        },
      ],
      logger: expect.anything(),
    });
    expect(client.replyToEmail).toHaveBeenCalledWith(
      expect.anything(),
      "Attached.",
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            filename: "lease.pdf",
            contentType: "application/pdf",
          }),
        ],
      }),
    );
  });

  it("passes static attachments into sent emails", async () => {
    const client = createMockEmailProvider();

    vi.mocked(resolveDraftAttachments).mockResolvedValue([
      {
        filename: "quote.pdf",
        content: Buffer.from("pdf"),
        contentType: "application/pdf",
      },
    ]);

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.SEND_EMAIL,
        to: "recipient@example.com",
        subject: "Quote",
        content: "Attached.",
        staticAttachments: [
          {
            driveConnectionId: "drive-1",
            name: "quote.pdf",
            sourceId: "file-2",
            sourcePath: "/Docs",
            type: AttachmentSourceType.FILE,
          },
        ],
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(resolveDraftAttachments).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      userId: "user-1",
      selectedAttachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-2",
          filename: "quote.pdf",
          mimeType: "application/pdf",
        },
      ],
      logger: expect.anything(),
    });
    expect(client.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "recipient@example.com",
        subject: "Quote",
        messageText: "Attached.",
        attachments: [
          expect.objectContaining({
            filename: "quote.pdf",
            contentType: "application/pdf",
          }),
        ],
      }),
    );
  });

  it("does not try to resolve attachments when drafts have no selected attachments", async () => {
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        content: "No attachments.",
      },
      emailAccount,
      executedRule: {
        id: "executed-rule-1",
        threadId: "thread-1",
        emailAccountId: "account-1",
        ruleId: "rule-1",
      } as any,
      logger,
    });

    expect(resolveDraftAttachments).not.toHaveBeenCalled();
    expect(client.draftEmail).toHaveBeenCalled();
  });
});
