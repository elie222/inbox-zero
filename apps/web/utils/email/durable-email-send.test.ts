import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";
import { discardDraftReplacedBySend } from "@/utils/email/compose-draft";
import { executeDurableEmailSend } from "./durable-email-send";
import type { sendHtmlEmailWithOpenTracking } from "./sent-message-open/sent-message-open.server";

vi.mock("@/utils/prisma");
vi.mock("@/utils/email/compose-draft", () => ({
  discardDraftReplacedBySend: vi.fn(),
}));
vi.mock("@/utils/email/sent-message-open/sent-message-open.server", () => ({
  sendHtmlEmailWithOpenTracking: ({
    email,
    emailProvider,
  }: Parameters<typeof sendHtmlEmailWithOpenTracking>[0]) =>
    emailProvider.sendEmailWithHtml(email),
}));

const input = {
  mutationId: "7f0c3b9e-2c1d-4d6e-9b2a-1f0e5d4c3b2a",
  queuedAt: Date.now(),
  threadId: "thread",
  messageIds: ["message"],
  email: {
    to: "person@example.com",
    subject: "Reply",
    messageHtml: "<p>Hello</p>",
  },
};

describe("executeDurableEmailSend", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    prisma.emailSendOperation.findUnique.mockResolvedValue(null);
    prisma.emailSendOperation.create.mockImplementation((async ({
      data,
    }: {
      data: { payloadHash: string };
    }) => ({
      id: "operation",
      status: EmailSendOperationStatus.PROCESSING,
      ...data,
    })) as never);
  });

  it("rejects a pre-send failure with its message and releases the operation", async () => {
    const provider = createMockEmailProvider({
      sendEmailWithHtml: vi
        .fn()
        .mockRejectedValue(new SafeError("Email sending is disabled.")),
    });

    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => provider,
      input,
      provider: "google",
    });

    expect(outcome).toEqual({
      status: "rejected",
      error: "Email sending is disabled.",
    });
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: { id: "operation" },
    });
    expect(prisma.emailSendOperation.updateMany).not.toHaveBeenCalled();
  });

  it("rejects provider setup failures without marking delivery uncertain", async () => {
    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => {
        throw new Error("Provider unavailable");
      },
      input,
      provider: "google",
    });

    expect(outcome.status).toBe("rejected");
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalled();
    expect(prisma.emailSendOperation.updateMany).not.toHaveBeenCalled();
  });

  it("removes the replaced draft once the send is delivered", async () => {
    const provider = createMockEmailProvider({
      sendEmailWithHtml: vi
        .fn()
        .mockResolvedValue({ messageId: "sent", threadId: "thread" }),
    });

    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => provider,
      input: {
        ...input,
        email: { ...input.email, replacesDraftOfSession: "session-1" },
      },
      provider: "google",
    });

    expect(outcome.status).toBe("applied");
    expect(discardDraftReplacedBySend).toHaveBeenCalledWith({
      emailAccountId: "account",
      sessionId: "session-1",
      provider,
    });
  });

  // An earlier dispatch may have delivered the email but not removed its
  // draft; a repeated dispatch finishes that cleanup.
  it("retries draft cleanup when the send was already delivered", async () => {
    const provider = createMockEmailProvider();
    const replacing = {
      ...input,
      email: { ...input.email, replacesDraftOfSession: "session-1" },
    };
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      id: "operation",
      status: EmailSendOperationStatus.SENT,
      payloadHash: createHash("sha256")
        .update(
          JSON.stringify({
            threadId: replacing.threadId,
            messageIds: replacing.messageIds,
            email: replacing.email,
            queuedAt: replacing.queuedAt,
          }),
        )
        .digest("hex"),
      result: { messageId: "sent", threadId: "thread" },
    } as never);

    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => provider,
      input: replacing,
      provider: "google",
    });

    expect(outcome.status).toBe("already_applied");
    expect(discardDraftReplacedBySend).toHaveBeenCalledWith({
      emailAccountId: "account",
      sessionId: "session-1",
      provider,
    });
  });

  it("reports a delivered send even when its draft cannot be removed", async () => {
    const provider = createMockEmailProvider({
      sendEmailWithHtml: vi
        .fn()
        .mockResolvedValue({ messageId: "sent", threadId: "thread" }),
    });
    vi.mocked(discardDraftReplacedBySend).mockRejectedValue(
      new Error("Draft changed"),
    );

    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => provider,
      input: {
        ...input,
        email: { ...input.email, replacesDraftOfSession: "session-1" },
      },
      provider: "google",
    });

    expect(outcome.status).toBe("applied");
    expect(discardDraftReplacedBySend).toHaveBeenCalledWith({
      emailAccountId: "account",
      sessionId: "session-1",
      provider,
    });
    expect(prisma.emailSendOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EmailSendOperationStatus.SENT,
        }),
      }),
    );
  });

  it("keeps a persistence failure uncertain after the provider accepts the send", async () => {
    const provider = createMockEmailProvider({
      sendEmailWithHtml: vi
        .fn()
        .mockResolvedValue({ messageId: "sent", threadId: "thread" }),
    });
    prisma.emailSendOperation.update.mockRejectedValue(
      new SafeError("Storage failed"),
    );
    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => provider,
      input,
      provider: "google",
    });

    expect(outcome).toEqual({ status: "uncertain" });
    expect(prisma.emailSendOperation.deleteMany).not.toHaveBeenCalled();
  });

  it("keeps unexplained provider failures uncertain", async () => {
    const provider = createMockEmailProvider({
      sendEmailWithHtml: vi.fn().mockRejectedValue(new Error("socket hang up")),
    });

    const outcome = await executeDurableEmailSend({
      logger: createScopedLogger("test"),
      emailAccountId: "account",
      getEmailProvider: async () => provider,
      input,
      provider: "google",
    });

    expect(outcome).toEqual({ status: "uncertain" });
    expect(prisma.emailSendOperation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "operation",
        status: EmailSendOperationStatus.PROCESSING,
      },
      data: { status: EmailSendOperationStatus.UNCERTAIN },
    });
    expect(prisma.emailSendOperation.deleteMany).not.toHaveBeenCalled();
  });
});
