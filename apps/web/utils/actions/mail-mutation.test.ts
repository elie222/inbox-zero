import { beforeEach, describe, expect, it, vi } from "vitest";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
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
    expect(mocks.archiveMessages).toHaveBeenCalledWith(["one", "two"]);
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
    prisma.emailSendOperation.findUnique.mockResolvedValue(getSendOperation());
    prisma.emailSendOperation.updateMany.mockResolvedValue({ count: 1 });

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "uncertain" });
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
    result: null,
    emailAccountId: "account-1",
  };
}
