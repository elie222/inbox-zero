import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScopedLogger } from "@/utils/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import {
  scheduleEmail,
  cancelScheduledEmail,
  processScheduledEmail,
  hasReplySince,
  processDueScheduledEmails,
} from "./service";
import type { ScheduledEmail } from "@/generated/prisma/client";
import type { ParsedMessage } from "@/utils/types";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/email/provider", () => ({ createEmailProvider: vi.fn() }));
vi.mock("@/utils/email/durable-email-send", () => ({
  executeDurableEmailSend: vi.fn(),
}));
const now = new Date("2026-09-05T10:00:00Z");
const logger = createScopedLogger("scheduled-email-test");
const input = {
  clientMutationId: "827f1b38-2032-4bfd-bc2c-cbba02746b04",
  threadId: "thread",
  messageIds: ["message"],
  email: {
    to: "person@example.com",
    subject: "Reply",
    messageHtml: "<p>Hello</p>",
  },
  sendAt: "2026-09-06T09:00:00Z",
  remindAt: "2026-09-08T09:00:00Z",
};

describe("scheduled replies", () => {
  beforeEach(() => vi.resetAllMocks());
  it("rejects past sends and reminders before delivery", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(null);
    await expect(
      scheduleEmail("account", { ...input, sendAt: now.toISOString() }, now),
    ).rejects.toThrow("future");
    await expect(
      scheduleEmail("account", { ...input, remindAt: now.toISOString() }, now),
    ).rejects.toThrow("after");
    expect(prisma.scheduledEmail.create).not.toHaveBeenCalled();
  });
  it("does not cancel an executing send", async () => {
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });
    await expect(cancelScheduledEmail("account", "id")).rejects.toThrow(
      "started",
    );
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "id",
          emailAccountId: "account",
          status: { in: ["PENDING", "BLOCKED_AUTH", "FAILED"] },
        },
      }),
    );
  });
  it("does not send twice when another worker holds the claim", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(row());
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });
    await processScheduledEmail("id", logger, now);
    expect(executeDurableEmailSend).not.toHaveBeenCalled();
  });
  it("reuses exact durable identity after a crash and leaves uncertain delivery terminal", async () => {
    const queuedAt = new Date(now.getTime() - 10 * 60_000);
    prisma.scheduledEmail.findUnique.mockResolvedValue(
      row({ executionQueuedAt: queuedAt }),
    );
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      account: { provider: "microsoft" },
    } as never);
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "uncertain",
    });
    await processScheduledEmail("id", logger, now);
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "microsoft",
        input: expect.objectContaining({
          mutationId: input.clientMutationId,
          queuedAt: queuedAt.getTime(),
          email: input.email,
        }),
      }),
    );
    expect(prisma.scheduledEmail.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "UNCERTAIN" }),
      }),
    );
  });
  it("persists future replies without sending and accepts an identical retry after its date passes", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(null);
    prisma.scheduledEmail.create.mockResolvedValue(row());
    await scheduleEmail("account", input, now);
    const saved = prisma.scheduledEmail.create.mock.calls[0][0].data;
    expect(saved).toMatchObject({
      emailAccountId: "account",
      payload: input,
      sendAt: new Date(input.sendAt),
      remindAt: new Date(input.remindAt),
      reminderStatus: "PENDING",
    });
    expect(executeDurableEmailSend).not.toHaveBeenCalled();

    const persisted = row({ payloadHash: saved.payloadHash });
    prisma.scheduledEmail.findUnique.mockResolvedValue(persisted);
    expect(await scheduleEmail("account", input, new Date("2026-09-10"))).toBe(
      persisted,
    );
    expect(prisma.scheduledEmail.create).toHaveBeenCalledTimes(1);
    await expect(
      scheduleEmail(
        "account",
        {
          ...input,
          email: { ...input.email, messageHtml: "Changed reply" },
        },
        now,
      ),
    ).rejects.toThrow("different email");
    expect(prisma.scheduledEmail.create).toHaveBeenCalledTimes(1);
  });

  it.each([
    "applied",
    "already_applied",
  ] as const)("records %s delivery using the persisted send timestamp", async (status) => {
    const sentAt = new Date(now.getTime() - 30_000);
    prisma.scheduledEmail.findUnique.mockResolvedValue(row());
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      account: { provider: "google" },
    } as never);
    prisma.emailSendOperation.findUniqueOrThrow.mockResolvedValue({
      processingStartedAt: sentAt,
    } as never);
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status,
      result: { messageId: "sent-message", threadId: "thread" },
    });

    await processScheduledEmail("id", logger, now);

    expect(executeDurableEmailSend).toHaveBeenCalledTimes(1);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenLastCalledWith({
      where: { id: "id", status: "PROCESSING", processingStartedAt: now },
      data: { status: "SENT", sentAt, error: null },
    });
  });

  it("delays a known-unsent retry without replacing its durable identity", async () => {
    const queuedAt = new Date(now.getTime() - 60_000);
    prisma.scheduledEmail.findUnique.mockResolvedValue(
      row({ executionQueuedAt: queuedAt }),
    );
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      account: { provider: "google" },
    } as never);
    prisma.emailSendOperation.findUnique.mockResolvedValue(null);
    vi.mocked(executeDurableEmailSend).mockResolvedValue({ status: "retry" });
    await processScheduledEmail("id", logger, now);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "PENDING",
          sendAt: new Date(now.getTime() + 60_000),
        }),
      }),
    );
    expect(executeDurableEmailSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          mutationId: input.clientMutationId,
          queuedAt: queuedAt.getTime(),
        }),
      }),
    );
  });

  it("keeps a live durable send non-cancellable when it asks another worker to retry", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(row());
    prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      account: { provider: "google" },
    } as never);
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      id: "live-operation",
    } as never);
    vi.mocked(executeDurableEmailSend).mockResolvedValue({ status: "retry" });
    await processScheduledEmail("id", logger, now);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROCESSING" }),
      }),
    );
  });

  it("retains the claim when recording a successful delivery fails", async () => {
    prisma.scheduledEmail.findUnique.mockResolvedValue(row());
    prisma.scheduledEmail.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockRejectedValueOnce(new Error("database unavailable"));
    prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
      account: { provider: "google" },
    } as never);
    prisma.emailSendOperation.findUniqueOrThrow.mockResolvedValue({
      processingStartedAt: now,
    } as never);
    vi.mocked(executeDurableEmailSend).mockResolvedValue({
      status: "applied",
      result: { messageId: "sent-message", threadId: "thread" },
    });
    await processScheduledEmail("id", logger, now);
    expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledTimes(2);
    expect(executeDurableEmailSend).toHaveBeenCalledTimes(1);
  });

  describe.each(["google", "microsoft"])("%s due reminders", (providerName) => {
    beforeEach(() => {
      prisma.scheduledEmail.findMany.mockResolvedValue([
        row({
          status: "SENT",
          sentAt: new Date(now.getTime() - 60_000),
          remindAt: now,
          reminderStatus: "PENDING",
        }),
      ]);
      prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 1 });
      prisma.emailAccount.findUniqueOrThrow.mockResolvedValue({
        email: "me@example.com",
        account: { provider: providerName },
      } as never);
    });

    it("returns an unanswered conversation to the inbox", async () => {
      const provider = createMockEmailProvider({
        getThreadMessages: vi.fn().mockResolvedValue([]),
      });
      vi.mocked(createEmailProvider).mockResolvedValue(provider);
      await processDueScheduledEmails(logger, now);
      expect(provider.unarchiveThread).toHaveBeenCalledWith("thread");
      expect(prisma.scheduledEmail.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { reminderStatus: "COMPLETED" },
        }),
      );
      expect(executeDurableEmailSend).not.toHaveBeenCalled();
    });

    it("completes without restoring when a reply arrived", async () => {
      const provider = createMockEmailProvider({
        getThreadMessages: vi.fn().mockResolvedValue([
          {
            headers: { from: "person@example.com", date: now.toISOString() },
            labelIds: ["INBOX"],
          },
        ]),
      });
      vi.mocked(createEmailProvider).mockResolvedValue(provider);
      await processDueScheduledEmails(logger, now);
      expect(provider.unarchiveThread).not.toHaveBeenCalled();
      expect(prisma.scheduledEmail.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: { reminderStatus: "COMPLETED" },
        }),
      );
    });

    it("does not restore when reply lookup fails", async () => {
      const provider = createMockEmailProvider({
        getThreadMessages: vi
          .fn()
          .mockRejectedValue(new Error("provider unavailable")),
      });
      vi.mocked(createEmailProvider).mockResolvedValue(provider);
      await processDueScheduledEmails(logger, now);
      expect(provider.unarchiveThread).not.toHaveBeenCalled();
      expect(prisma.scheduledEmail.updateMany).toHaveBeenCalledTimes(1);
    });

    it("does nothing after losing the reminder claim", async () => {
      prisma.scheduledEmail.updateMany.mockResolvedValue({ count: 0 });
      await processDueScheduledEmails(logger, now);
      expect(createEmailProvider).not.toHaveBeenCalled();
    });
  });

  it("uses provider receipt time over a skewed sender Date header", () => {
    const receivedAt = new Date(now.getTime() + 60_000);
    const message = {
      internalDate: String(receivedAt.getTime()),
      headers: { from: "person@example.com", date: "2020-01-01T00:00:00Z" },
      labelIds: ["INBOX"],
    } as ParsedMessage;
    expect(hasReplySince([message], "me@example.com", now)).toBe(true);
    expect(
      hasReplySince(
        [
          {
            ...message,
            internalDate: String(now.getTime() - 60_000),
            headers: { ...message.headers, date: "2030-01-01T00:00:00Z" },
          },
        ],
        "me@example.com",
        now,
      ),
    ).toBe(false);
  });

  it("counts only newer incoming non-draft replies", () => {
    const incoming = {
      headers: {
        from: "Person <person@example.com>",
        date: "2026-09-05T11:00:00Z",
      },
      labelIds: ["INBOX"],
    } as ParsedMessage;
    expect(hasReplySince([incoming], "me@example.com", now)).toBe(true);
    expect(
      hasReplySince(
        [{ ...incoming, labelIds: ["DRAFT"] }],
        "me@example.com",
        now,
      ),
    ).toBe(false);
    expect(
      hasReplySince(
        [
          {
            ...incoming,
            headers: { ...incoming.headers, from: "Me <me@example.com>" },
          },
        ],
        "me@example.com",
        now,
      ),
    ).toBe(false);
    expect(
      hasReplySince(
        [incoming],
        "me@example.com",
        new Date("2026-09-05T12:00:00Z"),
      ),
    ).toBe(false);
  });
});

function row(overrides: Partial<ScheduledEmail> = {}): ScheduledEmail {
  return {
    id: "id",
    emailAccountId: "account",
    threadId: "thread",
    clientMutationId: input.clientMutationId,
    payload: input,
    payloadHash: "hash",
    status: "PENDING",
    sendAt: now,
    createdAt: now,
    updatedAt: now,
    processingStartedAt: null,
    executionQueuedAt: null,
    sentAt: null,
    error: null,
    remindAt: null,
    reminderStatus: "NONE",
    reminderStartedAt: null,
    ...overrides,
  };
}
