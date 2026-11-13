import { vi, describe, it, expect, beforeEach } from "vitest";
import { HistoryEventType } from "./types";
import { handleLabelRemovedEvent } from "./process-label-removed-event";
import type { gmail_v1 } from "@googleapis/gmail";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import {
  GroupItemSource,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";

const logger = createTestLogger();

// Mock dependencies
vi.mock("@/utils/prisma", () => ({
  default: {
    rule: {
      findFirst: vi.fn(),
    },
    executedRule: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    groupItem: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    classificationFeedback: {
      upsert: vi
        .fn()
        .mockResolvedValue({ createdAt: new Date("2026-01-01T12:00:00Z") }),
      findFirst: vi.fn().mockResolvedValue({ id: "earlier-removal" }),
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/gmail/label", () => ({
  GmailLabel: {
    INBOX: "INBOX",
    SENT: "SENT",
    UNREAD: "UNREAD",
    STARRED: "STARRED",
    IMPORTANT: "IMPORTANT",
    SPAM: "SPAM",
    TRASH: "TRASH",
    DRAFT: "DRAFT",
    PERSONAL: "CATEGORY_PERSONAL",
    SOCIAL: "CATEGORY_SOCIAL",
    PROMOTIONS: "CATEGORY_PROMOTIONS",
    FORUMS: "CATEGORY_FORUMS",
    UPDATES: "CATEGORY_UPDATES",
  },
  GMAIL_SYSTEM_LABELS: [
    "INBOX",
    "SENT",
    "DRAFT",
    "SPAM",
    "TRASH",
    "IMPORTANT",
    "STARRED",
    "UNREAD",
    "CATEGORY_PERSONAL",
    "CATEGORY_SOCIAL",
    "CATEGORY_PROMOTIONS",
    "CATEGORY_FORUMS",
    "CATEGORY_UPDATES",
  ],
}));

vi.mock("@/utils/email", () => ({
  extractEmailAddress: vi.fn().mockReturnValue("sender@example.com"),
}));

vi.mock("@/utils/webhook/google/fetch-sender-from-message", () => ({
  fetchSenderFromMessage: vi.fn().mockResolvedValue("sender@example.com"),
}));

vi.mock("@/utils/rule/classification-feedback", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/utils/rule/classification-feedback")
  >()),
  saveClassificationFeedback: vi
    .fn()
    .mockResolvedValue({ createdAt: new Date("2026-01-01T12:00:00Z") }),
}));

vi.mock("@/utils/rule/consts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/rule/consts")>();
  return {
    ...actual,
    isEligibleForClassificationFeedback: vi.fn().mockReturnValue(true),
  };
});

describe("process-label-removed-event", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createLabelRemovedHistoryItem = (
    messageId = "123",
    threadId = "thread-123",
    labelIds = ["label-1"],
  ) => ({
    type: HistoryEventType.LABEL_REMOVED,
    item: {
      message: { id: messageId, threadId },
      labelIds,
    } as gmail_v1.Schema$HistoryLabelRemoved,
  });

  const mockEmailAccount = {
    id: "email-account-id",
    email: "user@test.com",
  } as any;
  const mockProvider = {
    getMessage: vi.fn().mockResolvedValue({
      headers: {
        from: "sender@example.com",
      },
    }),
    getLabels: vi.fn().mockResolvedValue([
      { id: "label-1", name: "Cold Email", type: "user" },
      { id: "label-2", name: "Newsletter", type: "user" },
      { id: "label-3", name: "Marketing", type: "user" },
      { id: "label-4", name: "To Reply", type: "user" },
    ]),
  } as any;

  const defaultOptions = {
    emailAccount: mockEmailAccount,
    provider: mockProvider,
  };

  describe("handleLabelRemovedEvent", () => {
    it("should process Cold Email label removal and call saveLearnedPattern with exclude: true", async () => {
      mockRulesThatAppliedLabel([
        { id: "rule-123", systemType: SystemType.COLD_EMAIL },
      ]);

      const historyItem = createLabelRemovedHistoryItem();

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).toHaveBeenCalledWith({
        emailAccountId: "email-account-id",
        from: "sender@example.com",
        ruleId: "rule-123",
        exclude: true,
        logger: expect.anything(),
        messageId: "123",
        threadId: "thread-123",
        reason: "Label removed",
        source: GroupItemSource.LABEL_REMOVED,
      });
    });

    it("should skip learning when To Reply label is removed (not a learnable rule)", async () => {
      mockRulesThatAppliedLabel([
        { id: "rule-456", systemType: SystemType.TO_REPLY },
      ]);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-4",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when only system labels are removed", async () => {
      const historyItem = {
        message: { id: "msg-123", threadId: "thread-123" },
        labelIds: ["INBOX", "UNREAD"], // Only system labels
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      // Should not try to fetch the message when only system labels removed
      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when DRAFT label is removed (prevents 404 errors)", async () => {
      const historyItem = {
        message: { id: "draft-123", threadId: "thread-123" },
        labelIds: ["DRAFT"], // Draft was sent - message no longer exists
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when only Gmail category labels are removed", async () => {
      const historyItem = {
        message: { id: "msg-123", threadId: "thread-123" },
        labelIds: ["CATEGORY_PROMOTIONS", "CATEGORY_UPDATES"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(mockProvider.getMessage).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when messageId is missing", async () => {
      const historyItem = {
        message: { threadId: "thread-123" }, // Missing messageId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip processing when threadId is missing", async () => {
      const historyItem = {
        message: { id: "123" }, // Missing threadId
        labelIds: ["label-1"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should handle multiple label removals in a single event", async () => {
      vi.mocked(prisma.executedRule.findMany)
        .mockResolvedValueOnce([
          executedRuleRow({
            rule: { id: "rule-1", systemType: SystemType.COLD_EMAIL },
            labelId: "label-1",
          }),
        ] as any)
        .mockResolvedValueOnce([
          executedRuleRow({
            rule: { id: "rule-2", systemType: SystemType.NEWSLETTER },
            labelId: "label-2",
          }),
        ] as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-1",
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).toHaveBeenCalledTimes(2);
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-1" }),
      );
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-2" }),
      );
    });

    it("records feedback but does not learn an exclusion for a bulk label removal", async () => {
      mockRulesThatAppliedLabel([
        { id: "rule-123", systemType: SystemType.NEWSLETTER },
      ]);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(
        historyItem.item,
        { ...defaultOptions, bulkRemovedLabelIds: new Set(["label-2"]) },
        logger,
      );

      expect(saveLearnedPattern).not.toHaveBeenCalled();
      expect(saveClassificationFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-123", messageId: "123" }),
      );
    });

    it("credits only rules that applied the removed label to this message", async () => {
      mockRulesThatAppliedLabel([
        { id: "rule-applied", systemType: SystemType.NEWSLETTER },
      ]);

      const historyItem = createLabelRemovedHistoryItem("msg-9", "thread-9", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(prisma.executedRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            emailAccountId: "email-account-id",
            messageId: "msg-9",
          }),
        }),
      );
      expect(prisma.rule.findFirst).not.toHaveBeenCalled();
      expect(saveClassificationFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-applied", messageId: "msg-9" }),
      );
    });

    it("does not credit a rule whose run applied a different label", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        executedRuleRow({
          rule: { id: "rule-other", systemType: SystemType.NEWSLETTER },
          labelId: "label-other",
        }),
        // Legacy run stored only a label name that is not the removed label.
        {
          rule: {
            id: "rule-legacy",
            systemType: SystemType.NEWSLETTER,
            actions: [{ label: "Newsletter" }],
          },
          actionItems: [
            { labelId: null, label: "Receipts", executionStatus: null },
          ],
        },
      ] as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveClassificationFeedback).not.toHaveBeenCalled();
    });

    it("credits a legacy run by the label name the rule uses for the removed label", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-legacy",
            systemType: SystemType.NEWSLETTER,
            actions: [{ label: "Newsletter" }],
          },
          actionItems: [
            { labelId: null, label: "Newsletter", executionStatus: null },
          ],
        },
      ] as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveClassificationFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-legacy" }),
      );
    });

    it("credits a run whose stored label ID was replaced when labelling", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        {
          rule: {
            id: "rule-replaced-id",
            systemType: SystemType.NEWSLETTER,
            actions: [{ label: "Newsletter" }],
          },
          actionItems: [
            {
              labelId: "stale-label-id",
              label: "Newsletter",
              executionStatus: "SUCCEEDED",
            },
          ],
        },
      ] as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveClassificationFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-replaced-id" }),
      );
    });

    it("credits a run whose label succeeded even if another action failed, but not a failed label", async () => {
      vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
        executedRuleRow({
          rule: { id: "rule-label-ok", systemType: SystemType.NEWSLETTER },
          labelId: "label-2",
          executionStatus: "SUCCEEDED",
        }),
        executedRuleRow({
          rule: { id: "rule-label-failed", systemType: SystemType.MARKETING },
          labelId: "label-2",
          executionStatus: "FAILED",
        }),
      ] as any);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(prisma.executedRule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ["APPLIED", "ERROR"] },
          }),
        }),
      );
      expect(saveClassificationFeedback).toHaveBeenCalledTimes(1);
      expect(saveClassificationFeedback).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "rule-label-ok" }),
      );
    });

    it("does not credit any rule when no rule applied the removed label to this message", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-with-same-label",
        systemType: SystemType.NEWSLETTER,
      } as any);
      mockRulesThatAppliedLabel([]);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "label-2",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveClassificationFeedback).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("should skip learning when no rule is found for the removed label", async () => {
      mockRulesThatAppliedLabel([]);

      const historyItem = createLabelRemovedHistoryItem("123", "thread-123", [
        "unknown-label",
      ]);

      await handleLabelRemovedEvent(historyItem.item, defaultOptions, logger);

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });

  describe("undoSpamLearning", () => {
    it("should undo spam learning when SPAM label is removed", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-1",
        groupId: "group-1",
      } as any);
      vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 1 });

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
        where: {
          groupId: "group-1",
          type: GroupItemType.FROM,
          value: { equals: "sender@example.com", mode: "insensitive" },
          source: GroupItemSource.LABEL_ADDED,
          exclude: false,
        },
      });
    });

    it("should not undo spam learning when no Cold Email rule exists", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue(null);

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.groupItem.deleteMany).not.toHaveBeenCalled();
    });

    it("should not undo spam learning when Cold Email rule has no groupId", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-1",
        groupId: null,
      } as any);

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      expect(prisma.groupItem.deleteMany).not.toHaveBeenCalled();
    });

    it("should handle SPAM removal + custom label removal in same event", async () => {
      // undoSpamLearning looks up cold email rule via prisma.rule.findFirst
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-cold",
        groupId: "group-cold",
      } as any);
      // the custom label was applied to this message by the newsletter rule
      mockRulesThatAppliedLabel([
        { id: "rule-newsletter", systemType: SystemType.NEWSLETTER },
      ]);
      vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 1 });

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM", "label-2"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      // Should undo spam learning
      expect(prisma.groupItem.deleteMany).toHaveBeenCalledWith({
        where: {
          groupId: "group-cold",
          type: GroupItemType.FROM,
          value: { equals: "sender@example.com", mode: "insensitive" },
          source: GroupItemSource.LABEL_ADDED,
          exclude: false,
        },
      });

      // Should also learn from custom label removal
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: "rule-newsletter",
          exclude: true,
          source: GroupItemSource.LABEL_REMOVED,
        }),
      );
    });

    it("should process SPAM-only removal (no custom labels)", async () => {
      vi.mocked(prisma.rule.findFirst).mockResolvedValue({
        id: "rule-1",
        groupId: "group-1",
      } as any);
      vi.mocked(prisma.groupItem.deleteMany).mockResolvedValue({ count: 1 });

      const historyItem = {
        message: { id: "msg-1", threadId: "thread-1" },
        labelIds: ["SPAM"],
      } as gmail_v1.Schema$HistoryLabelRemoved;

      await handleLabelRemovedEvent(historyItem, defaultOptions, logger);

      // Should call deleteMany for undo
      expect(prisma.groupItem.deleteMany).toHaveBeenCalled();
      // Should NOT call saveLearnedPattern (no custom labels to learn from)
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });
});

function mockRulesThatAppliedLabel(
  rules: { id: string; systemType: SystemType | null }[],
) {
  // Matches any removed label: the executed action stored only the label name
  // the rule uses for it.
  vi.mocked(prisma.executedRule.findMany).mockResolvedValue(
    rules.map((rule) => ({
      rule: { ...rule, actions: [{ label: "Rule label" }] },
      actionItems: [
        { labelId: null, label: "Rule label", executionStatus: null },
      ],
    })) as any,
  );
}

function executedRuleRow({
  rule,
  labelId,
  executionStatus = null,
}: {
  rule: { id: string; systemType: SystemType | null };
  labelId: string;
  executionStatus?: string | null;
}) {
  return {
    rule: { ...rule, actions: [] },
    actionItems: [{ labelId, label: null, executionStatus }],
  };
}
