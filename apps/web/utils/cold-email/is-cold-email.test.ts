import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ColdEmailSetting, ColdEmailStatus } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";
import * as labelUtils from "@/utils/gmail/label";
import { blockColdEmail } from "./is-cold-email";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    coldEmail: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("@/utils/gmail/label", async () => {
  const actual = await vi.importActual("@/utils/gmail/label");
  return {
    ...actual,
    getOrCreateInboxZeroLabel: vi.fn(),
    labelMessage: vi.fn(),
  };
});

describe("blockColdEmail", () => {
  const mockGmail = {} as gmail_v1.Gmail;
  const mockEmail = {
    from: "sender@example.com",
    messageId: "123",
    threadId: "thread123",
  };
  const mockUser = {
    id: "user123",
    email: "user@example.com",
    coldEmailBlocker: ColdEmailSetting.LABEL,
  };
  const mockAiReason = "This is a cold email";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should upsert cold email record in database", async () => {
    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      user: mockUser,
      aiReason: mockAiReason,
    });

    expect(prisma.coldEmail.upsert).toHaveBeenCalledWith({
      where: {
        userId_fromEmail: { userId: mockUser.id, fromEmail: mockEmail.from },
      },
      update: { status: ColdEmailStatus.AI_LABELED_COLD },
      create: {
        status: ColdEmailStatus.AI_LABELED_COLD,
        fromEmail: mockEmail.from,
        userId: mockUser.id,
        reason: mockAiReason,
        messageId: mockEmail.messageId,
        threadId: mockEmail.threadId,
      },
    });
  });

  it("should add cold email label when coldEmailBlocker is LABEL", async () => {
    vi.mocked(labelUtils.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
    });

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      user: mockUser,
      aiReason: mockAiReason,
    });

    expect(labelUtils.getOrCreateInboxZeroLabel).toHaveBeenCalledWith({
      gmail: mockGmail,
      key: "cold_email",
    });
    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.messageId,
      addLabelIds: ["label123"],
      removeLabelIds: undefined,
    });
  });

  it("should archive email when coldEmailBlocker is ARCHIVE_AND_LABEL", async () => {
    const userWithArchive = {
      ...mockUser,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
    };
    vi.mocked(labelUtils.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
    });

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      user: userWithArchive,
      aiReason: mockAiReason,
    });

    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.messageId,
      addLabelIds: ["label123"],
      removeLabelIds: [GmailLabel.INBOX],
    });
  });

  it("should archive and mark as read when coldEmailBlocker is ARCHIVE_AND_READ_AND_LABEL", async () => {
    const userWithArchiveAndRead = {
      ...mockUser,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
    };
    vi.mocked(labelUtils.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
    });

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      user: userWithArchiveAndRead,
      aiReason: mockAiReason,
    });

    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.messageId,
      addLabelIds: ["label123"],
      removeLabelIds: [GmailLabel.INBOX, GmailLabel.UNREAD],
    });
  });

  it("should throw error when user email is missing", async () => {
    const userWithoutEmail = { ...mockUser, email: null };

    await expect(
      blockColdEmail({
        gmail: mockGmail,
        email: mockEmail,
        user: userWithoutEmail,
        aiReason: mockAiReason,
      }),
    ).rejects.toThrow("User email is required");
  });

  it("should handle missing label id", async () => {
    vi.mocked(labelUtils.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: null,
    });

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      user: mockUser,
      aiReason: mockAiReason,
    });

    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.messageId,
      addLabelIds: undefined,
      removeLabelIds: undefined,
    });
  });

  it("should not modify labels when coldEmailBlocker is DISABLED", async () => {
    const userWithBlockerOff = {
      ...mockUser,
      coldEmailBlocker: ColdEmailSetting.DISABLED,
    };

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      user: userWithBlockerOff,
      aiReason: mockAiReason,
    });

    expect(labelUtils.getOrCreateInboxZeroLabel).not.toHaveBeenCalled();
    expect(labelUtils.labelMessage).not.toHaveBeenCalled();
  });
});
