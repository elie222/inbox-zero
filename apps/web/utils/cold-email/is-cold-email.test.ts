import { describe, it, expect, vi, beforeEach } from "vitest";
import prisma from "@/utils/prisma";
import { ColdEmailSetting, ColdEmailStatus } from "@/generated/prisma";
import { blockColdEmail } from "./is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";

// Mock dependencies
vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    coldEmail: {
      upsert: vi.fn(),
    },
  },
}));

describe("blockColdEmail", () => {
  const mockProvider = {
    getOrCreateInboxZeroLabel: vi.fn(),
    labelMessage: vi.fn(),
    archiveThread: vi.fn(),
    markReadThread: vi.fn(),
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
  });

  it("should upsert cold email record in database", async () => {
    vi.mocked(mockProvider.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
      name: "Cold Email",
      type: "user",
    });

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
    vi.mocked(mockProvider.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
      name: "Cold Email",
      type: "user",
    });

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(mockProvider.getOrCreateInboxZeroLabel).toHaveBeenCalledWith(
      "cold_email",
    );
    expect(mockProvider.labelMessage).toHaveBeenCalledWith(
      mockEmail.id,
      "Cold Email",
    );
  });

  it("should archive email when coldEmailBlocker is ARCHIVE_AND_LABEL", async () => {
    const userWithArchive = {
      ...mockEmailAccount,
      coldEmailBlocker: ColdEmailSetting.ARCHIVE_AND_LABEL,
    };
    vi.mocked(mockProvider.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
      name: "Cold Email",
      type: "user",
    });

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: userWithArchive,
      aiReason: mockAiReason,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith(
      mockEmail.id,
      "Cold Email",
    );
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
    vi.mocked(mockProvider.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "label123",
      name: "Cold Email",
      type: "user",
    });

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: userWithArchiveAndRead,
      aiReason: mockAiReason,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith(
      mockEmail.id,
      "Cold Email",
    );
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
    vi.mocked(mockProvider.getOrCreateInboxZeroLabel).mockResolvedValue({
      id: "",
      name: "Cold Email",
      type: "user",
    });

    await blockColdEmail({
      provider: mockProvider,
      email: mockEmail,
      emailAccount: mockEmailAccount,
      aiReason: mockAiReason,
    });

    expect(mockProvider.labelMessage).toHaveBeenCalledWith(
      mockEmail.id,
      "Cold Email",
    );
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

    expect(mockProvider.getOrCreateInboxZeroLabel).not.toHaveBeenCalled();
    expect(mockProvider.labelMessage).not.toHaveBeenCalled();
  });
});
