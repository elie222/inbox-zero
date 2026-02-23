import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createEmailProvider } from "@/utils/email/provider";
import { confirmAssistantEmailAction } from "@/utils/actions/assistant-chat";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({ user: { id: "u1", email: "owner@example.com" } })),
}));

describe("confirmAssistantEmailAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends a pending prepared email and persists confirmed output", async () => {
    (prisma.emailAccount.findUnique as any)
      .mockResolvedValueOnce({
        email: "owner@example.com",
        account: { userId: "u1", provider: "google" },
      })
      .mockResolvedValueOnce({
        name: "Owner",
        email: "owner@example.com",
      });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      parts: [
        {
          type: "tool-sendEmail",
          toolCallId: "tool-1",
          state: "output-available",
          output: {
            success: true,
            actionType: "send_email",
            requiresConfirmation: true,
            confirmationState: "pending",
            pendingAction: {
              to: "recipient@example.com",
              cc: null,
              bcc: null,
              subject: "Hello",
              messageHtml: "<p>Hi there</p>",
              from: null,
            },
          },
        },
      ],
    } as any);

    prisma.chatMessage.update.mockResolvedValue({
      id: "chat-message-1",
    } as any);

    const sendEmailWithHtml = vi.fn().mockResolvedValue({
      messageId: "msg-1",
      threadId: "thr-1",
    });
    vi.mocked(createEmailProvider).mockResolvedValue({
      sendEmailWithHtml,
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(sendEmailWithHtml).toHaveBeenCalledWith({
      to: "recipient@example.com",
      cc: undefined,
      bcc: undefined,
      subject: "Hello",
      messageHtml: "<p>Hi there</p>",
      from: "Owner <owner@example.com>",
    });
    expect(result?.data?.confirmationState).toBe("confirmed");
    expect(result?.data?.confirmationResult).toMatchObject({
      actionType: "send_email",
      messageId: "msg-1",
      threadId: "thr-1",
      to: "recipient@example.com",
      subject: "Hello",
    });

    const updatedParts = (prisma.chatMessage.update.mock.calls[0][0] as any)
      .data.parts as any[];
    expect(updatedParts[0].output.confirmationState).toBe("confirmed");
    expect(updatedParts[0].output.confirmationResult.actionType).toBe(
      "send_email",
    );
  });

  it("does not re-send an already confirmed action", async () => {
    (prisma.emailAccount.findUnique as any).mockResolvedValue({
      email: "owner@example.com",
      account: { userId: "u1", provider: "google" },
    });

    prisma.chatMessage.findFirst.mockResolvedValue({
      id: "chat-message-1",
      parts: [
        {
          type: "tool-sendEmail",
          toolCallId: "tool-1",
          state: "output-available",
          output: {
            success: true,
            actionType: "send_email",
            requiresConfirmation: true,
            confirmationState: "confirmed",
            pendingAction: {
              to: "recipient@example.com",
              cc: null,
              bcc: null,
              subject: "Hello",
              messageHtml: "<p>Hi there</p>",
              from: null,
            },
            confirmationResult: {
              actionType: "send_email",
              messageId: "msg-1",
              threadId: "thr-1",
              to: "recipient@example.com",
              subject: "Hello",
              confirmedAt: "2026-02-22T00:00:00.000Z",
            },
          },
        },
      ],
    } as any);

    const result = await confirmAssistantEmailAction(
      "ea_1" as any,
      {
        chatMessageId: "chat-message-1",
        toolCallId: "tool-1",
        actionType: "send_email",
      } as any,
    );

    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(prisma.chatMessage.update).not.toHaveBeenCalled();
    expect(result?.data?.confirmationResult).toMatchObject({
      messageId: "msg-1",
      threadId: "thr-1",
    });
  });
});
