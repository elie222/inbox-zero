import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/prisma";
import { ColdEmailSetting, ColdEmailStatus } from "@prisma/client";
import { blockColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import { getOrCreateSystemLabelId } from "@/utils/label-config";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    coldEmail: {
      upsert: vi.fn(),
    },
    emailAccount: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/utils/label-config", () => ({
  getOrCreateSystemLabelId: vi.fn(),
}));

describe("blockColdEmail", () => {
  const mockProvider = {
    labelMessage: vi.fn(),
    archiveThread: vi.fn(),
    markReadThread: vi.fn(),
    moveThreadToFolder: vi.fn(),
    getOrCreateOutlookFolderIdByName: vi.fn(),
    name: "google",
  } as unknown as EmailProvider;

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

    // Mock getOrCreateSystemLabelId to return a label ID
    vi.mocked(getOrCreateSystemLabelId).mockResolvedValue("label123");
  });

  it("should upsert cold email record in database", async () => {
    await blockColdEmail({
      provider: mockProvider,
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
    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(getOrCreateSystemLabelId).toHaveBeenCalledWith({
      emailAccountId: mockEmailAccount.id,
      type: "coldEmail",
      provider: mockProvider,
    });
    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: mockEmail.id,
      labelId: "label123",
    });
  });

  it("should archive email when coldEmailBlocker is ARCHIVE_AND_LABEL", async () => {
    const userWithArchive = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
    };

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: userWithArchive,
      aiReason: mockAiReason,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: mockEmail.id,
      labelId: "label123",
    });
    expect(mockProvider.archiveThread).toHaveBeenCalledWith(
      mockEmail.threadId,
      userWithArchive.email,
    );
  });

  it("should archive and mark as read when coldEmailBlocker is ARCHIVE_AND_READ_AND_LABEL", async () => {
    const userWithArchiveAndRead = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL,
    };

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: userWithArchiveAndRead,
      aiReason: mockAiReason,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith({
      messageId: mockEmail.id,
      labelId: "label123",
    });
    expect(mockProvider.archiveThread).toHaveBeenCalledWith(
      mockEmail.threadId,
      userWithArchiveAndRead.email,
    );
    expect(mockProvider.markReadThread).toHaveBeenCalledWith(
      mockEmail.threadId,
      true,
    );
  });

  it("should throw error when user email is missing", async () => {
    const userWithoutEmail = { ...mockEmailAccount, email: null as any };

    await expect(
      blockColdEmail({
        provider: mockProvider,
        email: mockEmail,
        emailAccount: userWithoutEmail,
        aiReason: mockAiReason,
      }),
    ).rejects.toThrow("User email is required");
  });

  it("should handle missing label id", async () => {
    vi.mocked(getOrCreateSystemLabelId).mockResolvedValue(null);

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(getOrCreateSystemLabelId).toHaveBeenCalled();
    expect(mockProvider.labelMessage).not.toHaveBeenCalled();
  });

  it("should not modify labels when coldEmailBlocker is DISABLED", async () => {
    const userWithBlockerOff = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.DISABLED,
    };

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: userWithBlockerOff,
      aiReason: mockAiReason,
    });

    expect(getOrCreateSystemLabelId).not.toHaveBeenCalled();
    expect(mockProvider.labelMessage).not.toHaveBeenCalled();
  });
});
