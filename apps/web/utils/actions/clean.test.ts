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
const mockGetLabels = vi.fn();
const mockLabelThread = vi.fn();
vi.mock("@/utils/gmail/label", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/utils/gmail/label")>();
  return {
    ...original,
    getLabel: (...args: unknown[]) => mockGetLabel(...args),
    getLabels: (...args: unknown[]) => mockGetLabels(...args),
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
    mockGetLabels.mockResolvedValue([]);
  });

  it("removes the AI-applied label by stored labelId on undo", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
      labelId: "label-finance",
    } as any);

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.ARCHIVE,
    });

    expect(mockGetLabels).not.toHaveBeenCalled();

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

    expect(prisma.cleanupThread.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        threadId: "thread-1",
        jobId: "job-1",
      },
      data: { label: null, labelId: null, labelAdded: false },
    });
  });

  it("does not remove the label when the clean run didn't add it", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
      labelId: "label-finance",
      labelAdded: false,
    } as any);

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
    expect(prisma.cleanupThread.updateMany).not.toHaveBeenCalled();
  });

  it("resolves the AI-applied label by exact name when no labelId is stored", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
      labelId: null,
    } as any);
    mockGetLabels.mockResolvedValue([{ id: "label-finance", name: "Finance" }]);

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
  });

  it("only removes the Inbox Zero label when no AI label was applied", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: null,
      labelId: null,
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
    expect(mockGetLabels).not.toHaveBeenCalled();

    const update = mockedUpdateThread.mock.calls[0][0].update;
    expect(update).toEqual({ undone: true, archive: false });
  });

  it("still undoes when the AI-applied label lookup fails", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Renamed Label",
      labelId: null,
    } as any);
    mockGetLabel.mockResolvedValueOnce({ id: "archived-label" });
    mockGetLabels.mockRejectedValueOnce(new Error("Gmail error"));

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

  it("scopes the record lookup to the job being undone", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-2",
      label: null,
      labelId: null,
    } as any);

    await undoCleanInboxAction("email-account-id", {
      threadId: "thread-1",
      markedDone: true,
      action: CleanAction.ARCHIVE,
      jobId: "job-2",
    });

    expect(prisma.cleanupThread.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        threadId: "thread-1",
        jobId: "job-2",
      },
      orderBy: { createdAt: "desc" },
      select: { jobId: true, label: true, labelId: true, labelAdded: true },
    });
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
    mockGetLabels.mockResolvedValue([]);
  });

  it("removes the AI-applied label by stored labelId and clears Redis and DB", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
      labelId: "label-finance",
    } as any);

    await removeLabelFromThreadAction("email-account-id", {
      threadId: "thread-1",
    });

    expect(mockGetLabels).not.toHaveBeenCalled();

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
      where: {
        emailAccountId: "email-account-id",
        threadId: "thread-1",
        jobId: "job-1",
      },
      data: { label: null, labelId: null, labelAdded: false },
    });
  });

  it("resolves the label by name when no labelId is stored", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
      labelId: null,
    } as any);
    mockGetLabels.mockResolvedValue([{ id: "label-finance", name: "Finance" }]);

    await removeLabelFromThreadAction("email-account-id", {
      threadId: "thread-1",
    });

    expect(mockLabelThread).toHaveBeenCalledWith({
      gmail: {},
      threadId: "thread-1",
      removeLabelIds: ["label-finance"],
    });
  });

  it("clears local state when the label no longer exists in Gmail", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: "Finance",
      labelId: null,
    } as any);
    mockGetLabels.mockResolvedValue([{ id: "other", name: "Other" }]);

    await removeLabelFromThreadAction("email-account-id", {
      threadId: "thread-1",
    });

    expect(mockLabelThread).not.toHaveBeenCalled();

    expect(mockedUpdateThread).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      jobId: "job-1",
      threadId: "thread-1",
      update: { label: null },
    });

    expect(prisma.cleanupThread.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        threadId: "thread-1",
        jobId: "job-1",
      },
      data: { label: null, labelId: null, labelAdded: false },
    });
  });

  it("does nothing when no AI-applied label is on the thread", async () => {
    prisma.cleanupThread.findFirst.mockResolvedValue({
      jobId: "job-1",
      label: null,
      labelId: null,
    } as any);

    await removeLabelFromThreadAction("email-account-id", {
      threadId: "thread-1",
    });

    expect(mockGetLabels).not.toHaveBeenCalled();
    expect(mockLabelThread).not.toHaveBeenCalled();
    expect(mockedUpdateThread).not.toHaveBeenCalled();
  });
});
