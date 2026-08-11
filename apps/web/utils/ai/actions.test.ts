import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ActionType,
  AttachmentSourceType,
  MessagingMessageStatus,
} from "@/generated/prisma/enums";
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
import { handlePreviousDraftDeletion } from "@/utils/ai/choose-rule/draft-management";
import { sendColdEmailNotification } from "@/utils/cold-email/send-notification";
import type { ParsedMessage } from "@/utils/types";
import prisma from "@/utils/prisma";
import { callMcpTool } from "@/utils/mcp/call-tool";
import { createTestLogger } from "@/__tests__/helpers";

const { mockEnv, mockIsIntegrationActionEnabledForUserId } = vi.hoisted(() => ({
  mockEnv: {
    deleteEmailActionEnabled: true,
    autoDraftDisabled: false,
    emailSendEnabled: true,
  },
  mockIsIntegrationActionEnabledForUserId: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/env", () => ({
  env: {
    get NEXT_PUBLIC_DELETE_EMAIL_ACTION_ENABLED() {
      return mockEnv.deleteEmailActionEnabled;
    },
    get NEXT_PUBLIC_AUTO_DRAFT_DISABLED() {
      return mockEnv.autoDraftDisabled;
    },
    get NEXT_PUBLIC_EMAIL_SEND_ENABLED() {
      return mockEnv.emailSendEnabled;
    },
  },
}));

vi.mock("@/utils/mcp/call-tool", () => ({
  callMcpTool: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/utils/integration-action.server", () => ({
  isIntegrationActionEnabledForUserId: mockIsIntegrationActionEnabledForUserId,
}));

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

vi.mock("@/utils/ai/choose-rule/draft-management", () => ({
  handlePreviousDraftDeletion: vi.fn().mockResolvedValue({
    shouldCreateDraft: true,
  }),
}));

vi.mock("@/utils/cold-email/send-notification", () => ({
  sendColdEmailNotification: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedAction: {
      update: vi.fn().mockResolvedValue({}),
    },
    mcpConnection: {
      findFirst: vi.fn().mockResolvedValue({ id: "connection-1" }),
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
    vi.mocked(sendMessagingRuleNotification).mockResolvedValue(true);
    vi.mocked(handlePreviousDraftDeletion).mockResolvedValue({
      shouldCreateDraft: true,
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
    );
  });

  it("skips mailbox draft creation when preserving an existing edited draft", async () => {
    const client = createMockEmailProvider();
    vi.mocked(handlePreviousDraftDeletion).mockResolvedValueOnce({
      shouldCreateDraft: false,
      existingDraftId: "draft-1",
      reason: "modified",
    });

    const result = await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DRAFT_EMAIL,
        content: "Replacement draft.",
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

    expect(result).toEqual({ draftId: "" });
    expect(resolveDraftAttachments).not.toHaveBeenCalled();
    expect(client.draftEmail).not.toHaveBeenCalled();
  });

  it("sends chat drafts through the messaging notification path", async () => {
    const client = createMockEmailProvider();

    const result = await runActionFunction({
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
    expect(result).toEqual({ success: true });
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

  it("marks chat draft actions failed when delivery cannot be completed", async () => {
    const client = createMockEmailProvider();
    vi.mocked(sendMessagingRuleNotification).mockResolvedValueOnce(false);

    const result = await runActionFunction({
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

    expect(result).toEqual({
      success: false,
      errorCode: "MESSAGING_DELIVERY_FAILED",
    });
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        messagingMessageStatus: MessagingMessageStatus.FAILED,
      },
    });
  });

  it("sends NOTIFY_MESSAGING_CHANNEL actions through the messaging notification path", async () => {
    const client = createMockEmailProvider();

    const result = await runActionFunction({
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
    expect(result).toEqual({ success: true });
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

  it("marks notify messaging actions failed when missing a channel id", async () => {
    const client = createMockEmailProvider();

    const result = await runActionFunction({
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
    });

    expect(result).toEqual({
      success: false,
      errorCode: "MISSING_MESSAGING_CHANNEL",
    });
    expect(prisma.executedAction.update).toHaveBeenCalledWith({
      where: { id: "action-1" },
      data: {
        messagingMessageStatus: MessagingMessageStatus.FAILED,
      },
    });
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

  describe("forward", () => {
    const executedRule = {
      id: "executed-rule-1",
      threadId: "thread-1",
      emailAccountId: "account-1",
      ruleId: "rule-1",
    } as any;

    it("removes message participants while forwarding to remaining recipients", async () => {
      const client = createMockEmailProvider();

      await runActionFunction({
        client,
        email: {
          ...email,
          headers: {
            ...email.headers,
            cc: "Existing <existing@example.com>",
            bcc: "hidden@example.com",
          },
        },
        action: {
          id: "action-1",
          type: ActionType.FORWARD,
          to: "Sender <SENDER@example.com>, user@example.com, Archive <archive@example.com>",
          cc: "existing@example.com, Reviewer <reviewer@example.com>",
          bcc: "hidden@example.com, auditor@example.com",
        },
        emailAccount,
        executedRule,
        logger,
      });

      expect(client.forwardEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          to: "Archive <archive@example.com>",
          cc: "Reviewer <reviewer@example.com>",
          bcc: "auditor@example.com",
        }),
      );
    });

    it("skips forwarding when every configured recipient is already on the message", async () => {
      const client = createMockEmailProvider();

      const result = await runActionFunction({
        client,
        email,
        action: {
          id: "action-1",
          type: ActionType.FORWARD,
          to: "Sender <SENDER@example.com>, user@example.com",
        },
        emailAccount,
        executedRule,
        logger,
      });

      expect(result).toEqual({
        skipped: true,
        reason: "NO_NEW_FORWARD_RECIPIENTS",
      });
      expect(client.forwardEmail).not.toHaveBeenCalled();
    });

    it("promotes a new CC recipient when every primary recipient is already on the message", async () => {
      const client = createMockEmailProvider();

      await runActionFunction({
        client,
        email,
        action: {
          id: "action-1",
          type: ActionType.FORWARD,
          to: "sender@example.com",
          cc: "Reviewer <reviewer@example.com>, auditor@example.com",
        },
        emailAccount,
        executedRule,
        logger,
      });

      expect(client.forwardEmail).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          to: "Reviewer <reviewer@example.com>",
          cc: "auditor@example.com",
        }),
      );
    });

    it("forwards separately to new BCC recipients when no visible recipient remains", async () => {
      const client = createMockEmailProvider();

      await runActionFunction({
        client,
        email,
        action: {
          id: "action-1",
          type: ActionType.FORWARD,
          to: "sender@example.com",
          bcc: "Reviewer <reviewer@example.com>, auditor@example.com",
        },
        emailAccount,
        executedRule,
        logger,
      });

      expect(client.forwardEmail).toHaveBeenCalledTimes(2);
      expect(client.forwardEmail).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        expect.objectContaining({
          to: "Reviewer <reviewer@example.com>",
        }),
      );
      expect(client.forwardEmail).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        expect.objectContaining({
          to: "auditor@example.com",
        }),
      );
      expect(client.forwardEmail.mock.calls[0]?.[1]).not.toHaveProperty("bcc");
      expect(client.forwardEmail.mock.calls[1]?.[1]).not.toHaveProperty("bcc");
    });

    it("forwards when every recipient is new to the message", async () => {
      const client = createMockEmailProvider();

      await runActionFunction({
        client,
        email,
        action: {
          id: "action-1",
          type: ActionType.FORWARD,
          to: "archive@example.com",
          cc: "reviewer@example.com",
        },
        emailAccount,
        executedRule,
        logger,
      });

      expect(client.forwardEmail).toHaveBeenCalledOnce();
    });
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

  it("trashes the thread when delete action is enabled", async () => {
    mockEnv.deleteEmailActionEnabled = true;
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DELETE,
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

    expect(client.trashThread).toHaveBeenCalledWith(
      "thread-1",
      emailAccount.email,
      "automation",
    );
  });

  it("skips delete action when delete email actions are disabled", async () => {
    mockEnv.deleteEmailActionEnabled = false;
    const client = createMockEmailProvider();

    await runActionFunction({
      client,
      email,
      action: {
        id: "action-1",
        type: ActionType.DELETE,
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

    expect(client.trashThread).not.toHaveBeenCalled();
  });

  describe("notify sender", () => {
    const runNotifySender = (from: string) =>
      runActionFunction({
        client: createMockEmailProvider(),
        email: { ...email, headers: { ...email.headers, from } },
        action: { id: "action-1", type: ActionType.NOTIFY_SENDER },
        emailAccount,
        executedRule: {
          id: "executed-rule-1",
          threadId: "thread-1",
          emailAccountId: "account-1",
          ruleId: "rule-1",
        } as any,
        logger,
      });

    it("notifies an external sender", async () => {
      await runNotifySender("outreach@vendor.com");

      expect(sendColdEmailNotification).toHaveBeenCalledWith(
        expect.objectContaining({ senderEmail: "outreach@vendor.com" }),
      );
    });

    it.each([
      ["a colleague on the account owner's domain", "ceo@example.com"],
      ["the account owner", "user@example.com"],
    ])("does not notify %s", async (_name, from) => {
      const result = await runNotifySender(from);

      expect(sendColdEmailNotification).not.toHaveBeenCalled();
      expect(result).toEqual({ skipped: true, reason: "INTERNAL_SENDER" });
    });
  });

  describe("integration", () => {
    const integrationAction = {
      id: "action-1",
      type: ActionType.INTEGRATION,
      integrationName: "todoist",
      integrationToolName: "add-tasks",
      integrationArgs: {
        content: "Follow up on lease packet",
        description: "From the property email",
        dueString: "tomorrow",
        projectId: "inbox",
        projectName: "Inbox",
      },
    };

    function runIntegration(
      action: Parameters<typeof runActionFunction>[0]["action"],
    ) {
      return runActionFunction({
        client: createMockEmailProvider(),
        email,
        action,
        emailAccount,
        executedRule: { id: "rule-1" } as never,
        logger,
      });
    }

    beforeEach(() => {
      mockIsIntegrationActionEnabledForUserId.mockResolvedValue(true);
      vi.mocked(prisma.mcpConnection.findFirst).mockResolvedValue({
        id: "connection-1",
      } as never);
      vi.mocked(callMcpTool).mockResolvedValue([]);
    });

    it("adds a Todoist task with the resolved args", async () => {
      const result = await runIntegration(integrationAction);

      expect(callMcpTool).toHaveBeenCalledWith({
        emailAccountId: "account-1",
        integration: "todoist",
        toolName: "add-tasks",
        args: {
          tasks: [
            {
              content: "Follow up on lease packet",
              description: "From the property email",
              dueString: "tomorrow",
              projectId: "inbox",
            },
          ],
        },
      });
      expect(result).toEqual({ success: true });
    });

    it("omits empty optional args (e.g. AI decided there is no due date)", async () => {
      await runIntegration({
        ...integrationAction,
        integrationArgs: { content: "Follow up", dueString: "  " },
      });

      expect(callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { tasks: [{ content: "Follow up" }] },
        }),
      );
    });

    it("maps stored due-date options to the tool's wire format", async () => {
      await runIntegration({
        ...integrationAction,
        integrationArgs: {
          content: "Follow up",
          dueString: "in-7-days",
          projectId: "inbox",
          projectName: "Inbox",
        },
      });

      expect(callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            tasks: [
              {
                content: "Follow up",
                dueString: "in 7 days",
                projectId: "inbox",
              },
            ],
          },
        }),
      );
    });

    it("sends a custom due date through unchanged", async () => {
      await runIntegration({
        ...integrationAction,
        integrationArgs: { content: "Follow up", dueString: "next Friday" },
      });

      expect(callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({
          args: {
            tasks: [{ content: "Follow up", dueString: "next Friday" }],
          },
        }),
      );
    });

    it("omits the due date when the AI option was never filled", async () => {
      await runIntegration({
        ...integrationAction,
        integrationArgs: { content: "Follow up", dueString: "ai" },
      });

      expect(callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { tasks: [{ content: "Follow up" }] },
        }),
      );
    });

    it("never sends the display-only project name to the tool", async () => {
      await runIntegration({
        ...integrationAction,
        integrationArgs: {
          content: "Follow up",
          projectId: "6X7",
          projectName: "Work",
        },
      });

      expect(callMcpTool).toHaveBeenCalledWith(
        expect.objectContaining({
          args: { tasks: [{ content: "Follow up", projectId: "6X7" }] },
        }),
      );
    });

    it("skips when integration actions are disabled", async () => {
      mockIsIntegrationActionEnabledForUserId.mockResolvedValue(false);

      const result = await runIntegration(integrationAction);

      expect(callMcpTool).not.toHaveBeenCalled();
      expect(result).toEqual({
        skipped: true,
        reason: "INTEGRATION_ACTION_DISABLED",
      });
    });

    it("fails with a clear code when the integration is not connected", async () => {
      vi.mocked(prisma.mcpConnection.findFirst).mockResolvedValue(null);

      const result = await runIntegration(integrationAction);

      expect(callMcpTool).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        success: false,
        errorCode: "INTEGRATION_NOT_CONNECTED",
      });
    });

    it("fails when the action has no task content", async () => {
      const result = await runIntegration({
        ...integrationAction,
        integrationArgs: { description: "no content" },
      });

      expect(callMcpTool).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        success: false,
        errorCode: "MISSING_INTEGRATION_ARGS",
      });
    });

    it("rejects tools that are not registered write tools", async () => {
      const result = await runIntegration({
        ...integrationAction,
        integrationToolName: "delete-tasks",
      });

      expect(callMcpTool).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        success: false,
        errorCode: "UNSUPPORTED_INTEGRATION_TOOL",
      });
    });

    it("returns a structured failure when the tool call throws", async () => {
      vi.mocked(callMcpTool).mockRejectedValue(new Error("server unavailable"));

      const result = await runIntegration(integrationAction);

      expect(result).toMatchObject({
        success: false,
        errorCode: "INTEGRATION_CALL_FAILED",
        errorMessage: expect.stringContaining("server unavailable"),
      });
    });
  });
});
