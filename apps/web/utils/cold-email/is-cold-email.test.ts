import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ColdEmailSetting, ColdEmailStatus } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";
import * as labelUtils from "@/utils/gmail/label";
import { blockColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";

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
    id: "123",
    threadId: "thread123",
  };
  const mockEmailAccount = {
    ...getEmailAccount(),
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
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(prisma.coldEmail.upsert).toHaveBeenCalledWith({
      where: {
        emailAccountId_fromEmail: {
          emailAccountId: mockEmailAccount.id,
          fromEmail: mockEmail.from,
        },
      },
      update: { status: ColdEmailStatus.AI_LABELED_COLD },
      create: {
        status: ColdEmailStatus.AI_LABELED_COLD,
        fromEmail: mockEmail.from,
        emailAccountId: mockEmailAccount.id,
        reason: mockAiReason,
        messageId: mockEmail.id,
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
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(labelUtils.getOrCreateInboxZeroLabel).toHaveBeenCalledWith({
      gmail: mockGmail,
      key: "cold_email",
    });
    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.id,
      addLabelIds: ["label123"],
      removeLabelIds: undefined,
    });
  });

  it("should archive email when coldEmailBlocker is ARCHIVE_AND_LABEL", async () => {
    const userWithArchive = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
    };
    vi.mocked(labelUtils.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
    });

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      emailAccount: userWithArchive,
      aiReason: mockAiReason,
    });

    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.id,
      addLabelIds: ["label123"],
      removeLabelIds: [GmailLabel.INBOX],
    });
  });

  it("should archive and mark as read when coldEmailBlocker is ARCHIVE_AND_READ_AND_LABEL", async () => {
    const userWithArchiveAndRead = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
    };
    vi.mocked(labelUtils.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
    });

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      emailAccount: userWithArchiveAndRead,
      aiReason: mockAiReason,
    });

    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.id,
      addLabelIds: ["label123"],
      removeLabelIds: [GmailLabel.INBOX, GmailLabel.UNREAD],
    });
  });

  it("should throw error when user email is missing", async () => {
    const userWithoutEmail = { ...mockEmailAccount, email: null as any };

    await expect(
      blockColdEmail({
        gmail: mockGmail,
        email: mockEmail,
        emailAccount: userWithoutEmail,
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
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(labelUtils.labelMessage).toHaveBeenCalledWith({
      gmail: mockGmail,
      messageId: mockEmail.id,
      addLabelIds: undefined,
      removeLabelIds: undefined,
    });
  });

  it("should not modify labels when coldEmailBlocker is DISABLED", async () => {
    const userWithBlockerOff = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.DISABLED,
    };

    await blockColdEmail({
      gmail: mockGmail,
      email: mockEmail,
      emailAccount: userWithBlockerOff,
      aiReason: mockAiReason,
    });

    expect(labelUtils.getOrCreateInboxZeroLabel).not.toHaveBeenCalled();
    expect(labelUtils.labelMessage).not.toHaveBeenCalled();
  });
});
