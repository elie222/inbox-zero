import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  removeLabelFromThreadAction,
  undoCleanInboxAction,
} from "@/utils/actions/clean";
import { CleanAction } from "@/generated/prisma/enums";
import { GmailLabel } from "@/utils/gmail/label";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const { envMock } = vi.hoisted(() => ({
  envMock: {
    NODE_ENV: "test",
    NEXT_PUBLIC_AUTO_DRAFT_DISABLED: false,
  },
}));

vi.mock("@/env", () => ({
  env: envMock,
}));

const mockGetGmailClientForEmail = vi.fn();
vi.mock("@/utils/email-account-client", () => ({
  getGmailClientForEmail: (...args: unknown[]) =>
    mockGetGmailClientForEmail(...args),
}));

const mockGetLabel = vi.fn();
const mockLabelThread = vi.fn();
vi.mock("@/utils/gmail/label", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/gmail/label")>();
  return {
    ...original,
    getLabel: (...args: unknown[]) => mockGetLabel(...args),
    labelThread: (...args: unknown[]) => mockLabelThread(...args),
  };
});

vi.mock("@/utils/redis/clean", () => ({
  updateThread: vi.fn().mockResolvedValue(undefined),
}));

import { updateThread } from "@/utils/redis/clean";

const mockedUpdateThread = vi.mocked(updateThread);

describe("undoCleanInboxAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as any);

    mockGetGmailClientForEmail.mockResolvedValue({});
    mockLabelThread.mockResolvedValue(undefined);
    mockGetLabel.mockResolvedValue({ id: "archived-label", name: "Archived" });
  });

  it("removes the AI-applied label on undo", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
    } as any);
    mockGetLabel
      .mockResolvedValueOnce({ id: "archived-label" })
      .mockResolvedValueOnce({ id: "label-finance" });

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.ARCHIVE,
    });

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: [GmailLabel.INBOX],
      removeLabelIds: ["archived-label", "label-finance"],
    });

    expect(mockedUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { undone: true, archive: false, label: null },
    });
  });

  it("only removes the Inbox Zero label when no AI label was applied", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: null,
    } as any);

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.MARK_READ,
    });

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: [GmailLabel.UNREAD],
      removeLabelIds: ["archived-label"],
    });
    expect(mockGetLabel).toHaveBeenCalledTimes(1);

    const update = mockedUpdateThread.mock.calls[0][0].update;
    expect(update).toEqual({ undone: true, archive: false });
  });

  it("still undoes when the AI-applied label lookup fails", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Renamed Label",
    } as any);
    mockGetLabel
      .mockResolvedValueOnce({ id: "archived-label" })
      .mockRejectedValueOnce(new Error("Gmail error"));

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.ARCHIVE,
    });

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      addLabelIds: [GmailLabel.INBOX],
      removeLabelIds: ["archived-label"],
    });

    const update = mockedUpdateThread.mock.calls[0][0].update;
    expect(update).toEqual({ undone: true, archive: false });
  });

  it("updates Redis via the fallback jobId when the DB row is missing", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue(null);

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.ARCHIVE,
      jobId: "job-from-ui",
    });

    const update = mockedUpdateThread.mock.calls[0][0];
    expect(update).toEqual({
      emailAccountId: "email-account-id",
      jobId: "job-from-ui",
      threadId: "thread-1",
      update: { undone: true, archive: false },
    });
  });

  it("does not update Redis when no jobId is known", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue(null);

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.ARCHIVE,
    });

    expect(mockedUpdateThread).not.toHaveBeenCalled();
  });
});

describe("removeLabelFromThreadAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: { userId: "user-1", provider: "google" },
    } as any);

    mockGetGmailClientForEmail.mockResolvedValue({});
    mockLabelThread.mockResolvedValue(undefined);
    mockGetLabel.mockResolvedValue({ id: "label-finance", name: "Finance" });
  });

  it("removes the AI-applied label and clears Redis and DB", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
    } as any);

    await removeLabelFromThreadAction("email-account-id", {
      threadId: "thread-1",
    });

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      removeLabelIds: ["label-finance"],
    });

    expect(mockedUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { label: null },
    });

    expect(prisma.cleanupThread.updateMany).toHaveBeenCalledWith({
      where: { emailAccountId: "email-account-id", threadId: "thread-1" },
      data: { label: null },
    });
  });

  it("does nothing when no AI-applied label is on the thread", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: null,
    } as any);

    await removeLabelFromThreadAction("email-account-id", {
      threadId: "thread-1",
    });

    expect(mockGetLabel).not.toHaveBeenCalled();
    expect(mockLabelThread).not.toHaveBeenCalled();
    expect(mockedUpdateThread).not.toHaveBeenCalled();
  });
});
