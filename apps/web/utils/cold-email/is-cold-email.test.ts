import { describe, it, expect, vi, beforeEach } from "vitest";
import type { gmail_v1 } from "@googleapis/gmail";
import prisma from "@/utils/prisma";
import { ColdEmailSetting, ColdEmailStatus } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";
import * as labelUtils from "@/utils/gmail/label";
import { blockColdEmail, isColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import { hasPreviousCommunicationsWithSenderOrDomain } from "@/utils/gmail/message";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    coldEmail: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
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

vi.mock("@/utils/gmail/message", () => ({
  hasPreviousCommunicationsWithSenderOrDomain: vi.fn(),
}));

vi.mock("@/utils/llms", () => ({
  chatCompletionObject: vi.fn(),
}));

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

describe("isColdEmail", () => {
  const mockGmail = {} as gmail_v1.Gmail;
  const mockEmailAccount = {
    ...getEmailAccount(),
    coldEmailBlocker: ColdEmailSetting.LABEL,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return false when sender is marked as USER_REJECTED_COLD", async () => {
    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue({
      id: "test-id",
      status: ColdEmailStatus.USER_REJECTED_COLD,
    } as any);
    
    // Mock hasPreviousCommunicationsWithSenderOrDomain to return false
    vi.mocked(hasPreviousCommunicationsWithSenderOrDomain).mockResolvedValue(false);
    
    // Mock AI response
    const mockChatCompletionObject = vi.fn().mockResolvedValue({
      object: { coldEmail: false, reason: "Not a cold email" },
    });
    vi.doMock("@/utils/llms", () => ({
      chatCompletionObject: mockChatCompletionObject,
    }));

    const result = await isColdEmail({
      email: {
        from: "sender@example.com",
        to: "",
        subject: "Test",
        content: "Test content",
        id: "123",
        date: new Date(),
      },
      emailAccount: mockEmailAccount,
      gmail: mockGmail,
    });

    expect(result.isColdEmail).toBe(false);
    expect(result.reason).toBe("ai");
    expect(result.aiReason).toBe("Not a cold email");
  });

  it("should return true when sender is marked as AI_LABELED_COLD", async () => {
    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue({
      id: "test-id",
      status: ColdEmailStatus.AI_LABELED_COLD,
    } as any);

    const result = await isColdEmail({
      email: {
        from: "sender@example.com",
        to: "",
        subject: "Test",
        content: "Test content",
        id: "123",
      },
      emailAccount: mockEmailAccount,
      gmail: mockGmail,
    });

    expect(result.isColdEmail).toBe(true);
    expect(result.reason).toBe("ai-already-labeled");
  });

  it("should check AI when sender is not in database", async () => {
    vi.mocked(prisma.coldEmail.findUnique).mockResolvedValue(null);
    
    // Mock hasPreviousCommunicationsWithSenderOrDomain
    vi.mocked(hasPreviousCommunicationsWithSenderOrDomain).mockResolvedValue(false);
    
    // Mock AI response
    const mockChatCompletionObject = vi.fn().mockResolvedValue({
      object: { coldEmail: true, reason: "This is a cold email" },
    });
    vi.doMock("@/utils/llms", () => ({
      chatCompletionObject: mockChatCompletionObject,
    }));

    const result = await isColdEmail({
      email: {
        from: "sender@example.com",
        to: "",
        subject: "Test",
        content: "Test content",
        id: "123",
        date: new Date(),
      },
      emailAccount: mockEmailAccount,
      gmail: mockGmail,
    });

    expect(result.isColdEmail).toBe(true);
    expect(result.reason).toBe("ai");
    expect(result.aiReason).toBe("This is a cold email");
  });
});
