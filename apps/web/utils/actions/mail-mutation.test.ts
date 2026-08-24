import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  MailMutationReceiptKind,
  MailMutationReceiptStatus,
} from "@/generated/prisma/enums";
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
    prisma.mailMutationReceipt.findUnique.mockResolvedValue(null);
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
    const receipt = getReceipt();
    prisma.mailMutationReceipt.create.mockResolvedValue(receipt);
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

    prisma.mailMutationReceipt.findUnique.mockResolvedValue({
      ...receipt,
      status: MailMutationReceiptStatus.APPLIED,
      result: { messageId: "message", threadId: "thread" },
    });
    const replay = await executeMailMutationAction("account-1", input);
    expect(replay?.data).toMatchObject({ status: "already_applied" });
    expect(mocks.sendEmailWithHtml).toHaveBeenCalledOnce();
  });

  it("reconciles an applied reply before creating a provider client", async () => {
    prisma.mailMutationReceipt.findUnique.mockResolvedValue({
      ...getReceipt(),
      status: MailMutationReceiptStatus.APPLIED,
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
    prisma.mailMutationReceipt.findUnique.mockResolvedValue(getReceipt());
    prisma.mailMutationReceipt.updateMany.mockResolvedValue({ count: 1 });

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "uncertain" });
    expect(mocks.sendEmailWithHtml).not.toHaveBeenCalled();
  });

  it("rejects a reply mutation ID reused for a different thread snapshot", async () => {
    prisma.mailMutationReceipt.findUnique.mockResolvedValue(getReceipt());

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

  it("marks an ambiguous reply send uncertain without deleting its receipt", async () => {
    const receipt = getReceipt();
    prisma.mailMutationReceipt.create.mockResolvedValue(receipt);
    mocks.sendEmailWithHtml.mockRejectedValue(new Error("fetch failed"));

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "uncertain" });
    expect(prisma.mailMutationReceipt.updateMany).toHaveBeenCalledWith({
      where: {
        id: "receipt",
        status: MailMutationReceiptStatus.PROCESSING,
      },
      data: { status: MailMutationReceiptStatus.UNCERTAIN },
    });
    expect(prisma.mailMutationReceipt.deleteMany).not.toHaveBeenCalled();
  });

  it("retries an explicit reply throttle after deleting the unsent receipt", async () => {
    const receipt = getReceipt();
    prisma.mailMutationReceipt.create.mockResolvedValue(receipt);
    mocks.sendEmailWithHtml.mockRejectedValue(
      new Error("Batch request failed", {
        cause: Object.assign(new Error("Provider request was throttled"), {
          response: { status: 429 },
        }),
      }),
    );

    const result = await executeMailMutationAction("account-1", replyInput());

    expect(result?.data).toEqual({ status: "retry" });
    expect(prisma.mailMutationReceipt.deleteMany).toHaveBeenCalledWith({
      where: { id: "receipt" },
    });
    expect(prisma.mailMutationReceipt.updateMany).not.toHaveBeenCalled();
  });
});

function replyInput() {
  return {
    kind: "reply" as const,
    mutationId,
    threadId: "thread",
    messageIds: ["one"],
    email: { to: "to@example.com", subject: "Hi", messageHtml: "<p>Hi</p>" },
  };
}

function getReceipt() {
  return {
    id: "receipt",
    createdAt: new Date(0),
    updatedAt: new Date(0),
    clientMutationId: mutationId,
    kind: MailMutationReceiptKind.REPLY,
    payloadHash:
      "be75732f41910eeff36332d0b9d0a37b74279c32ef6996f896e6eebd06b99644",
    status: MailMutationReceiptStatus.PROCESSING,
    processingStartedAt: new Date(0),
    result: null,
    emailAccountId: "account-1",
  };
}
