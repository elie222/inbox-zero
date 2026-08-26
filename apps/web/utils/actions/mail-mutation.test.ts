import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  DurableEmailPreparationRejectedError,
  executeDurableEmailSend,
} from "@/utils/email/durable-email-send";
import { executeMailMutationAction } from "./mail-mutation";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const mocks = vi.hoisted(() => ({
  activateSnooze: vi.fn(),
  archiveMessages: vi.fn(),
  cancelSnooze: vi.fn(),
  createEmailProvider: vi.fn(),
  prepareSnooze: vi.fn(),
  sendEmailWithHtml: vi.fn(),
  unarchiveMessages: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mocks.createEmailProvider,
}));
vi.mock("@/utils/snooze/scheduler", () => ({
  activatePreparedSnoozedThread: mocks.activateSnooze,
  cancelSnoozedThreadByClientMutationId: mocks.cancelSnooze,
  prepareSnoozedThread: mocks.prepareSnooze,
}));

const mutationId = "018f47f0-5c72-7f11-a396-4f9f15d2e9e8";

describe("executeMailMutationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "owner@example.com",
        userId: "user-1",
        provider: "google",
      }),
    );
    mocks.createEmailProvider.mockResolvedValue({
      archiveMessages: mocks.archiveMessages,
      sendEmailWithHtml: mocks.sendEmailWithHtml,
      unarchiveMessages: mocks.unarchiveMessages,
    });
    mocks.archiveMessages.mockResolvedValue(undefined);
    mocks.unarchiveMessages.mockResolvedValue(undefined);
    mocks.prepareSnooze.mockResolvedValue({
      created: true,
      snoozedThread: { id: "snooze", status: "PREPARING" },
    });
    mocks.activateSnooze.mockResolvedValue({
      id: "snooze",
      status: "PENDING",
    });
    prisma.emailSendOperation.findUnique.mockResolvedValue(null);
  });

  it("applies an immutable archive snapshot", async () => {
    const result = await executeMailMutationAction("account-1", {
      kind: "archive",
      mutationId,
      threadId: "thread",
      messageIds: ["one", "two"],
    });

    expect(result?.data).toEqual({ status: "applied" });
    expect(mocks.archiveMessages).toHaveBeenCalledWith(
      ["one", "two"],
      undefined,
    );
  });

  it("applies an archive label to the immutable snapshot", async () => {
    const result = await executeMailMutationAction("account-1", {
      kind: "archive",
      mutationId,
      threadId: "thread",
      messageIds: ["one", "two"],
      labelId: "label-id",
    });

    expect(result?.data).toEqual({ status: "applied" });
    expect(mocks.archiveMessages).toHaveBeenCalledWith(
      ["one", "two"],
      "label-id",
    );
  });

  it("replays an already-created snooze after its wall-clock time", async () => {
    mocks.prepareSnooze.mockResolvedValue({
      created: false,
      snoozedThread: { id: "snooze", status: "PREPARING" },
    });
    const scheduledFor = "2020-01-01T00:00:00.000Z";

    const result = await executeMailMutationAction("account-1", {
      kind: "snooze",
      mutationId,
      threadId: "thread",
      messageIds: ["one"],
      scheduledFor,
    });

    expect(result?.data).toEqual({
      status: "applied",
      result: { reconciled: "snooze_expired" },
    });
    expect(mocks.prepareSnooze).toHaveBeenCalledBefore(mocks.unarchiveMessages);
    expect(mocks.archiveMessages).not.toHaveBeenCalled();
    expect(mocks.unarchiveMessages).toHaveBeenCalledWith(["one"]);
    expect(mocks.activateSnooze).not.toHaveBeenCalled();
    expect(mocks.cancelSnooze).toHaveBeenCalledOnce();
  });

  it("does not archive again when replaying a fully activated snooze", async () => {
    mocks.prepareSnooze.mockResolvedValue({
      created: false,
      snoozedThread: { id: "snooze", status: "PENDING" },
    });

    const result = await executeMailMutationAction("account-1", {
      kind: "snooze",
      mutationId,
      threadId: "thread",
      messageIds: ["one"],
      scheduledFor: "2020-01-01T00:00:00.000Z",
    });

    expect(result?.data).toEqual({ status: "already_applied" });
    expect(mocks.archiveMessages).not.toHaveBeenCalled();
    expect(mocks.activateSnooze).not.toHaveBeenCalled();
  });

  it("rejects a fresh expired snooze before archiving", async () => {
    const result = await executeMailMutationAction("account-1", {
      kind: "snooze",
      mutationId,
      threadId: "thread",
      messageIds: ["one"],
      scheduledFor: "2020-01-01T00:00:00.000Z",
    });

    expect(result?.data).toEqual({
      status: "rejected",
      error: "Snooze time has passed",
    });
    expect(mocks.cancelSnooze).toHaveBeenCalledOnce();
    expect(mocks.archiveMessages).not.toHaveBeenCalled();
  });

  it("cancels a snooze after a definitive archive rejection", async () => {
    mocks.archiveMessages.mockRejectedValue(
      Object.assign(new Error("bad request"), { status: 400 }),
    );
    const result = await executeMailMutationAction("account-1", {
      kind: "snooze",
      mutationId,
      threadId: "thread",
      messageIds: ["one"],
      scheduledFor: "2099-01-01T00:00:00.000Z",
    });

    expect(result?.data?.status).toBe("rejected");
    expect(mocks.cancelSnooze).toHaveBeenCalledWith({
      clientMutationId: mutationId,
      emailAccountId: "account-1",
    });
  });

  it("restores a snapshot when the prepared snooze is cancelled during archive", async () => {
    mocks.activateSnooze.mockResolvedValue({
      id: "snooze",
      status: "CANCELLED",
    });

    const result = await executeMailMutationAction("account-1", {
      kind: "snooze",
      mutationId,
      threadId: "thread",
      messageIds: ["one"],
      scheduledFor: "2099-01-01T00:00:00.000Z",
    });

    expect(result?.data).toEqual({
      status: "applied",
      result: { reconciled: "snooze_cancelled" },
    });
    expect(mocks.archiveMessages).toHaveBeenCalledBefore(
      mocks.unarchiveMessages,
    );
  });

  it("persists a reply result and returns it without sending again", async () => {
    const operation = getSendOperation();
    prisma.emailSendOperation.create.mockResolvedValue(operation);
    mocks.sendEmailWithHtml.mockResolvedValue({
      messageId: "message",
      threadId: "thread",
    });
    const input = replyInput();

    const first = await executeMailMutationAction("account-1", input);
    expect(first?.data).toMatchObject({
      status: "applied",
      result: { messageId: "message", threadId: "thread" },
    });

    prisma.emailSendOperation.findUnique.mockResolvedValue({
      ...operation,
      status: EmailSendOperationStatus.SENT,
      result: { messageId: "message", threadId: "thread" },
    });
    const replay = await executeMailMutationAction("account-1", input);
    expect(replay?.data).toMatchObject({ status: "already_applied" });
    expect(mocks.sendEmailWithHtml).toHaveBeenCalledOnce();
  });

  it("reconciles an applied reply before creating a provider client", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      ...getSendOperation(),
      status: EmailSendOperationStatus.SENT,
      result: { messageId: "message", threadId: "thread" },
    });
    mocks.createEmailProvider.mockRejectedValue(new Error("expired auth"));

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({
      status: "already_applied",
      result: { messageId: "message", threadId: "thread" },
    });
    expect(mocks.createEmailProvider).not.toHaveBeenCalled();
  });

  it("marks a stale processing reply uncertain without sending", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      ...getSendOperation(),
      providerStartedAt: new Date(0),
    });
    prisma.emailSendOperation.updateMany.mockResolvedValue({ count: 1 });

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "uncertain" });
    expect(prisma.emailSendOperation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "operation",
        providerStartedAt: { not: null },
        status: EmailSendOperationStatus.PROCESSING,
        processingStartedAt: { lte: expect.any(Date) },
      },
      data: { status: EmailSendOperationStatus.UNCERTAIN },
    });
    expect(mocks.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("rejects a reply mutation ID reused for a different thread snapshot", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue(getSendOperation());

    const result = await executeMailMutationAction("account-1", {
      ...replyInput(),
      threadId: "different-thread",
    });

    expect(result?.data).toEqual({
      status: "rejected",
      error: "Mutation ID was reused",
    });
    expect(mocks.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("marks an ambiguous reply send uncertain without deleting its operation", async () => {
    const operation = getSendOperation();
    prisma.emailSendOperation.create.mockResolvedValue(operation);
    mocks.sendEmailWithHtml.mockRejectedValue(new Error("fetch failed"));

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "uncertain" });
    expect(prisma.emailSendOperation.updateMany).toHaveBeenCalledWith({
      where: {
        id: "operation",
        status: EmailSendOperationStatus.PROCESSING,
      },
      data: { status: EmailSendOperationStatus.UNCERTAIN },
    });
    expect(prisma.emailSendOperation.deleteMany).not.toHaveBeenCalled();
  });

  it("retries an explicit reply throttle after deleting the unsent operation", async () => {
    const operation = getSendOperation();
    prisma.emailSendOperation.create.mockResolvedValue(operation);
    mocks.sendEmailWithHtml.mockRejectedValue(
      new Error("Batch request failed", {
        cause: Object.assign(new Error("Provider request was throttled"), {
          response: { status: 429 },
        }),
      }),
    );

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "retry" });
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: { id: "operation" },
    });
    expect(prisma.emailSendOperation.updateMany).not.toHaveBeenCalled();
  });

  it("does not send a queued email after the retry window has elapsed", async () => {
    const result = await executeMailMutationAction("account-1", {
      ...replyInput(),
      queuedAt: 0,
    });

    expect(result?.data).toEqual({
      status: "rejected",
      error: "Queued email is too old to send safely",
    });
    expect(prisma.emailSendOperation.create).not.toHaveBeenCalled();
    expect(mocks.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("reconciles an old queued email while its sent operation still exists", async () => {
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      ...getSendOperation(),
      payloadHash:
        "230eefe5fafb5561ec27294a022a1d657997caa91f9615f066bfce181c1a2e26",
      status: EmailSendOperationStatus.SENT,
      result: { messageId: "message", threadId: "thread" },
    });

    const result = await executeMailMutationAction("account-1", {
      ...replyInput(),
      queuedAt: 0,
    });

    expect(result?.data).toEqual({
      status: "already_applied",
      result: { messageId: "message", threadId: "thread" },
    });
    expect(mocks.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it.each([
    {
      expectedStatus: "already_applied",
      operationStatus: EmailSendOperationStatus.SENT,
    },
    {
      expectedStatus: "uncertain",
      operationStatus: EmailSendOperationStatus.UNCERTAIN,
    },
    {
      expectedStatus: "uncertain",
      operationStatus: EmailSendOperationStatus.PROCESSING,
      providerStartedAt: new Date(0),
      staleCount: 1,
    },
    {
      expectedStatus: "retry",
      operationStatus: EmailSendOperationStatus.PROCESSING,
      processingStartedAt: new Date(),
      providerStartedAt: null,
    },
  ])("does not prepare an email for a duplicate $expectedStatus result", async ({
    expectedStatus,
    operationStatus,
    processingStartedAt,
    providerStartedAt,
    staleCount,
  }) => {
    const canonicalInput = "stable-canonical-input";
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      ...getSendOperation(),
      payloadHash: createHash("sha256").update(canonicalInput).digest("hex"),
      processingStartedAt:
        processingStartedAt ?? getSendOperation().processingStartedAt,
      providerStartedAt: providerStartedAt ?? null,
      status: operationStatus,
      result:
        operationStatus === EmailSendOperationStatus.SENT
          ? { messageId: "message", threadId: "thread" }
          : null,
    });
    if (staleCount !== undefined) {
      prisma.emailSendOperation.updateMany.mockResolvedValue({
        count: staleCount,
      });
    }
    const prepareEmail = vi.fn();
    const getEmailProvider = vi.fn();

    const result = await executeDurableEmailSend({
      emailAccountId: "account-1",
      getEmailProvider,
      input: replyInput(),
      payloadHashInput: canonicalInput,
      prepareEmail,
      provider: "google",
    });

    expect(result.status).toBe(expectedStatus);
    expect(prepareEmail).not.toHaveBeenCalled();
    expect(getEmailProvider).not.toHaveBeenCalled();
  });

  it("releases a stale operation that crashed before calling the provider", async () => {
    const canonicalInput = "stable-canonical-input";
    prisma.emailSendOperation.findUnique.mockResolvedValue({
      ...getSendOperation(),
      payloadHash: createHash("sha256").update(canonicalInput).digest("hex"),
      providerStartedAt: null,
    });
    const prepareEmail = vi.fn();
    const getEmailProvider = vi.fn();

    const result = await executeDurableEmailSend({
      emailAccountId: "account-1",
      getEmailProvider,
      input: replyInput(),
      payloadHashInput: canonicalInput,
      prepareEmail,
      provider: "google",
    });

    expect(result).toEqual({ status: "retry" });
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "operation",
        processingStartedAt: { lte: expect.any(Date) },
        providerStartedAt: null,
        status: EmailSendOperationStatus.PROCESSING,
      },
    });
    expect(prepareEmail).not.toHaveBeenCalled();
    expect(getEmailProvider).not.toHaveBeenCalled();
    expect(prisma.emailSendOperation.updateMany).not.toHaveBeenCalled();
  });

  it("prepares a newly claimed email before creating the provider", async () => {
    const operation = getSendOperation();
    prisma.emailSendOperation.create.mockResolvedValue(operation);
    const preparedEmail = {
      ...replyInput().email,
      attachments: [
        {
          filename: "report.txt",
          content: "cmVwb3J0",
          contentType: "text/plain",
        },
      ],
    };
    const prepareEmail = vi.fn().mockResolvedValue(preparedEmail);
    const getEmailProvider = vi.fn().mockResolvedValue({
      sendEmailWithHtml: mocks.sendEmailWithHtml,
    });
    mocks.sendEmailWithHtml.mockResolvedValue({
      messageId: "message",
      threadId: "thread",
    });

    const result = await executeDurableEmailSend({
      emailAccountId: "account-1",
      getEmailProvider,
      input: replyInput(),
      prepareEmail,
      provider: "google",
    });

    expect(result.status).toBe("applied");
    expect(prepareEmail).toHaveBeenCalledBefore(getEmailProvider);
    expect(prisma.emailSendOperation.update).toHaveBeenNthCalledWith(1, {
      where: { id: "operation" },
      data: { providerStartedAt: expect.any(Date) },
    });
    expect(prepareEmail).toHaveBeenCalledBefore(
      prisma.emailSendOperation.update,
    );
    expect(prisma.emailSendOperation.update).toHaveBeenCalledBefore(
      getEmailProvider,
    );
    expect(getEmailProvider).toHaveBeenCalledBefore(mocks.sendEmailWithHtml);
    expect(mocks.sendEmailWithHtml).toHaveBeenCalledWith(preparedEmail);
  });

  it("releases a newly claimed operation when preparation can be retried", async () => {
    const operation = getSendOperation();
    prisma.emailSendOperation.create.mockResolvedValue(operation);
    const prepareEmail = vi
      .fn()
      .mockRejectedValue(new Error("blob unavailable"));
    const getEmailProvider = vi.fn();

    const result = await executeDurableEmailSend({
      emailAccountId: "account-1",
      getEmailProvider,
      input: replyInput(),
      prepareEmail,
      provider: "google",
    });

    expect(result).toEqual({ status: "retry" });
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: { id: "operation" },
    });
    expect(getEmailProvider).not.toHaveBeenCalled();
    expect(prisma.emailSendOperation.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a definitive preparation failure before creating the provider", async () => {
    const operation = getSendOperation();
    prisma.emailSendOperation.create.mockResolvedValue(operation);
    const prepareEmail = vi
      .fn()
      .mockRejectedValue(
        new DurableEmailPreparationRejectedError(
          "The staged attachments are invalid",
        ),
      );
    const getEmailProvider = vi.fn();

    const result = await executeDurableEmailSend({
      emailAccountId: "account-1",
      getEmailProvider,
      input: replyInput(),
      prepareEmail,
      provider: "google",
    });

    expect(result).toEqual({
      status: "rejected",
      error: "The staged attachments are invalid",
    });
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: { id: "operation" },
    });
    expect(getEmailProvider).not.toHaveBeenCalled();
    expect(prisma.emailSendOperation.updateMany).not.toHaveBeenCalled();
  });
});

function replyInput() {
  return {
    kind: "reply" as const,
    mutationId,
    threadId: "thread",
    messageIds: ["one"],
    queuedAt: Date.parse("2099-01-01T00:00:00.000Z"),
    email: { to: "to@example.com", subject: "Hi", messageHtml: "<p>Hi</p>" },
  };
}

function getSendOperation() {
  return {
    id: "operation",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    clientMutationId: mutationId,
    payloadHash:
      "4b2bc95a57ac227662e7cf4fcdf78bdea75af4f5cf9d4dff14c838bf66d1cded",
    status: EmailSendOperationStatus.PROCESSING,
    processingStartedAt: new Date(0),
    providerStartedAt: null,
    result: null,
    emailAccountId: "account-1",
  };
}
