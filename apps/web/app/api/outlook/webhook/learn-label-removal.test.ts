import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { GroupItemSource, SystemType } from "@/generated/prisma/enums";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { learnFromOutlookCategoryReversal } from "./learn-label-removal";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/prisma", () => ({
  default: {
    executedRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    action: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));

const logger = createScopedLogger("test");

describe("learnFromOutlookCategoryReversal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.action.findMany).mockResolvedValue([]);
    vi.mocked(saveLearnedPattern).mockResolvedValue(undefined);
  });

  describe("LABEL actions (category removal)", () => {
    it("learns exclusion when a previously applied label is removed", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-newsletter",
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAccountId: "email-account-123",
          from: "sender@example.com",
          ruleId: "rule-1",
          exclude: true,
          messageId: "message-123",
          threadId: "thread-123",
          reason: "Label removed",
          source: GroupItemSource.LABEL_REMOVED,
        }),
      );
    });

    it("does not learn when label remains on message", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-newsletter",
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX", "label-newsletter"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("does not learn for non-learnable rule types", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.TO_REPLY,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-to-reply",
              label: "To Reply",
              folderId: null,
              folderName: null,
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("deduplicates learning calls by rule id", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-newsletter",
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-newsletter",
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).toHaveBeenCalledTimes(1);
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-1" }),
      );
    });

    it("does not learn when name-only action resolves to an existing label id", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: null,
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.action.findMany).mockResolvedValue([
        {
          ruleId: "rule-1",
          label: "Newsletter",
          labelId: "label-newsletter",
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX", "label-newsletter"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("skips learning for unresolved name-only actions", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: null,
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
      ] as any);
      vi.mocked(prisma.action.findMany).mockResolvedValue([]);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX", "label-newsletter-id"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });

  describe("MOVE_FOLDER actions (folder move reversal)", () => {
    it("learns exclusion when message with MOVE_FOLDER action is back in inbox", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-cold",
            systemType: SystemType.COLD_EMAIL,
          },
          actionItems: [
            {
              type: "MOVE_FOLDER",
              labelId: null,
              label: null,
              folderId: "folder-cold-email-id",
              folderName: "Cold Email",
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-456",
        threadId: "thread-456",
        labelIds: ["INBOX"],
        headers: { from: "salesperson@company.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAccountId: "email-account-123",
          from: "salesperson@company.com",
          ruleId: "rule-cold",
          exclude: true,
          messageId: "message-456",
          threadId: "thread-456",
          reason: "Label removed",
          source: GroupItemSource.LABEL_REMOVED,
        }),
      );
    });

    it("learns for MOVE_FOLDER with only folderName (no folderId)", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-newsletter",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "MOVE_FOLDER",
              labelId: null,
              label: null,
              folderId: null,
              folderName: "Newsletter",
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-789",
        threadId: "thread-789",
        labelIds: ["INBOX"],
        headers: { from: "news@blog.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          from: "news@blog.com",
          ruleId: "rule-newsletter",
          exclude: true,
        }),
      );
    });

    it("does not learn MOVE_FOLDER when message is not in inbox", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-cold",
            systemType: SystemType.COLD_EMAIL,
          },
          actionItems: [
            {
              type: "MOVE_FOLDER",
              labelId: null,
              label: null,
              folderId: "folder-cold-email-id",
              folderName: "Cold Email",
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-456",
        threadId: "thread-456",
        labelIds: ["ARCHIVE"],
        headers: { from: "salesperson@company.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("does not learn MOVE_FOLDER for non-learnable rule types", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-to-reply",
            systemType: SystemType.TO_REPLY,
          },
          actionItems: [
            {
              type: "MOVE_FOLDER",
              labelId: null,
              label: null,
              folderId: "folder-to-reply-id",
              folderName: "To Reply",
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-456",
        threadId: "thread-456",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("learns for all Outlook MOVE_FOLDER system types", async () => {
      const moveFolderTypes = [
        { systemType: SystemType.NEWSLETTER, ruleId: "rule-newsletter" },
        { systemType: SystemType.MARKETING, ruleId: "rule-marketing" },
        { systemType: SystemType.RECEIPT, ruleId: "rule-receipt" },
        { systemType: SystemType.NOTIFICATION, ruleId: "rule-notification" },
        { systemType: SystemType.COLD_EMAIL, ruleId: "rule-cold-email" },
      ];

      for (const { systemType, ruleId } of moveFolderTypes) {
        vi.clearAllMocks();
        vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
          {
            rule: { id: ruleId, systemType },
            actionItems: [
              {
                type: "MOVE_FOLDER",
                labelId: null,
                label: null,
                folderId: `folder-${ruleId}`,
                folderName: systemType,
              },
            ],
          },
        ] as any);

        const message = getMockParsedMessage({
          id: "message-123",
          threadId: "thread-123",
          labelIds: ["INBOX"],
          headers: { from: "sender@example.com" },
        });

        await learnFromOutlookCategoryReversal({
          message,
          emailAccountId: "email-account-123",
          logger,
        });

        expect(saveLearnedPattern).toHaveBeenCalledWith(
          expect.objectContaining({ ruleId, exclude: true }),
        );
      }
    });
  });

  describe("combined LABEL + MOVE_FOLDER scenarios", () => {
    it("deduplicates when both LABEL and MOVE_FOLDER actions exist for the same rule", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-1",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-newsletter",
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
            {
              type: "MOVE_FOLDER",
              labelId: null,
              label: null,
              folderId: "folder-newsletter-id",
              folderName: "Newsletter",
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).toHaveBeenCalledTimes(1);
    });

    it("learns from multiple different rules in one pass", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-newsletter",
            systemType: SystemType.NEWSLETTER,
          },
          actionItems: [
            {
              type: "LABEL",
              labelId: "label-newsletter",
              label: "Newsletter",
              folderId: null,
              folderName: null,
            },
          ],
        },
        {
          rule: {
            id: "rule-cold-email",
            systemType: SystemType.COLD_EMAIL,
          },
          actionItems: [
            {
              type: "MOVE_FOLDER",
              labelId: null,
              label: null,
              folderId: "folder-cold-email-id",
              folderName: "Cold Email",
            },
          ],
        },
      ] as any);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).toHaveBeenCalledTimes(2);
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-newsletter" }),
      );
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-cold-email" }),
      );
    });
  });

  describe("edge cases", () => {
    it("skips learning when label state is missing", async () => {
      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: undefined,
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("skips learning when sender is missing", async () => {
      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("skips learning when threadId is missing", async () => {
      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("skips when no executed rules match", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([]);

      const message = getMockParsedMessage({
        id: "message-123",
        threadId: "thread-123",
        labelIds: ["INBOX"],
        headers: { from: "sender@example.com" },
      });

      await learnFromOutlookCategoryReversal({
        message,
        emailAccountId: "email-account-123",
        logger,
      });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });
});
