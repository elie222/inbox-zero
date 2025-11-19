import { describe, it, expect, vi, beforeEach } from "vitest";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import { getEmailAccount } from "@/__tests__/helpers";
import type { EmailProvider } from "@/utils/email/types";
import { ActionType } from "@prisma/client";
import prisma from "@/utils/__mocks__/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/llms", () => ({
  createGenerateObject: vi.fn(() =>
    vi.fn().mockResolvedValue({
      object: { coldEmail: true, reason: "Test AI reason" },
    }),
  ),
}));

describe("Cold Email - Exclude from Search", () => {
  const mockProvider: EmailProvider = {
    hasPreviousCommunicationsWithSenderOrDomain: vi.fn(),
  } as unknown as EmailProvider;

  const mockEmailAccount = getEmailAccount();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock the database check for known cold email senders
    prisma.coldEmail.findUnique.mockResolvedValue(null);
  });

  describe("Gmail - Label exclusion", () => {
    it("should exclude emails with cold email label from search", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.LABEL,
            label: "Cold Email",
            labelId: "label-123",
          },
        ],
      };

      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);

      await isColdEmail({
        email: {
          from: "test@example.com",
          to: "user@example.com",
          subject: "Test",
          content: "Test",
          date: new Date(),
          id: "msg-123",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).toHaveBeenCalledWith({
        from: "test@example.com",
        date: expect.any(Date),
        messageId: "msg-123",
        excludeLabel: "Cold Email",
        excludeFolder: null,
      });
    });

    it("should use custom label name when configured", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.LABEL,
            label: "Spam-ish",
            labelId: "label-456",
          },
        ],
      };

      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);

      await isColdEmail({
        email: {
          from: "test@example.com",
          to: "user@example.com",
          subject: "Test",
          content: "Test",
          date: new Date(),
          id: "msg-123",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeLabel: "Spam-ish",
          excludeFolder: null,
        }),
      );
    });
  });

  describe("Microsoft Outlook - Category vs Folder exclusion", () => {
    it("should use category filter for LABEL action", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.LABEL,
            label: "Cold Email",
            labelId: "category-123",
          },
        ],
      };

      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);

      await isColdEmail({
        email: {
          from: "test@example.com",
          to: "user@example.com",
          subject: "Test",
          content: "Test",
          date: new Date(),
          id: "msg-123",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).toHaveBeenCalledWith({
        from: "test@example.com",
        date: expect.any(Date),
        messageId: "msg-123",
        excludeLabel: "Cold Email",
        excludeFolder: null,
      });
    });

    it("should use folder filter for MOVE_FOLDER action", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.MOVE_FOLDER,
            label: "Cold Email",
            labelId: null,
          },
        ],
      };

      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);

      await isColdEmail({
        email: {
          from: "test@example.com",
          to: "user@example.com",
          subject: "Test",
          content: "Test",
          date: new Date(),
          id: "msg-123",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).toHaveBeenCalledWith({
        from: "test@example.com",
        date: expect.any(Date),
        messageId: "msg-123",
        excludeLabel: null,
        excludeFolder: "Cold Email",
      });
    });
  });

  describe("Fallback behavior", () => {
    it("should use default Cold Email label when no rule is configured", async () => {
      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);

      await isColdEmail({
        email: {
          from: "test@example.com",
          to: "user@example.com",
          subject: "Test",
          content: "Test",
          date: new Date(),
          id: "msg-123",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule: null,
      });

      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          excludeLabel: "Cold Email",
          excludeFolder: null,
        }),
      );
    });

    it("should not check previous emails when date or id is missing", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.LABEL,
            label: "Cold Email",
            labelId: "label-123",
          },
        ],
      };

      await isColdEmail({
        email: {
          from: "test@example.com",
          to: "user@example.com",
          subject: "Test",
          content: "Test",
          // Missing date and id
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).not.toHaveBeenCalled();
    });
  });

  describe("Previous email detection with exclusion", () => {
    it("should not mark as cold email when previous non-cold email exists", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.LABEL,
            label: "Cold Email",
            labelId: "label-123",
          },
        ],
      };

      // Simulate finding a previous email that's NOT marked as cold
      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(true);

      const result = await isColdEmail({
        email: {
          from: "colleague@company.com",
          to: "user@example.com",
          subject: "Follow up",
          content: "Test",
          date: new Date(),
          id: "msg-456",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      expect(result.isColdEmail).toBe(false);
      expect(result.reason).toBe("hasPreviousEmail");
    });

    it("should check AI when no previous non-cold email exists", async () => {
      const coldEmailRule = {
        id: "rule-1",
        enabled: true,
        instructions: "test",
        actions: [
          {
            type: ActionType.LABEL,
            label: "Cold Email",
            labelId: "label-123",
          },
        ],
      };

      // Simulate NOT finding any previous email (all were cold emails and excluded)
      vi.mocked(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).mockResolvedValue(false);

      const result = await isColdEmail({
        email: {
          from: "spammer@company.com",
          to: "user@example.com",
          subject: "Buy our services",
          content: "Test",
          date: new Date(),
          id: "msg-789",
        },
        emailAccount: mockEmailAccount,
        provider: mockProvider,
        coldEmailRule,
      });

      // Should proceed to AI check (we're not testing AI here, so it will use the real function)
      expect(
        mockProvider.hasPreviousCommunicationsWithSenderOrDomain,
      ).toHaveBeenCalled();
    });
  });
});
