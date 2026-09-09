import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";
import { executeDurableEmailSend } from "./durable-email-send";

vi.mock("@/utils/prisma");

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

  it("keeps unexplained provider failures uncertain", async () => {
    const provider = createMockEmailProvider({
      sendEmailWithHtml: vi.fn().mockRejectedValue(new Error("socket hang up")),
    });

    const outcome = await executeDurableEmailSend({
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
