import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  isLearnFromLabelsEnabled,
  learnSenderFromLabel,
} from "./learn-from-label";
import { ActionType, GroupItemSource } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";
import { createTestLogger } from "@/__tests__/helpers";

const logger = createTestLogger();

vi.mock("@/utils/prisma", () => ({
  default: {
    emailAccount: { findUnique: vi.fn() },
    rule: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/rule/rule", () => ({
  createRuleWithResolvedActions: vi
    .fn()
    .mockResolvedValue({ id: "new-rule-id" }),
}));

describe("learn-from-label", () => {
  const mockProvider = {
    getLabelById: vi
      .fn()
      .mockResolvedValue({ id: "Label_1", name: "Receipts" }),
    getMessage: vi.fn().mockResolvedValue({ labelIds: ["Label_1"] }),
  } as any;

  const baseArgs = {
    emailAccountId: "email-account-id",
    labelId: "Label_1",
    sender: "sender@example.com",
    messageId: "123",
    threadId: "thread-123",
    provider: mockProvider,
    logger,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.rule.findUnique).mockResolvedValue(null);
    vi.mocked(mockProvider.getLabelById).mockResolvedValue({
      id: "Label_1",
      name: "Receipts",
    });
    vi.mocked(mockProvider.getMessage).mockResolvedValue({
      labelIds: ["Label_1"],
    });
  });

  describe("isLearnFromLabelsEnabled", () => {
    it("reads the account setting", async () => {
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue({
        learnFromLabels: true,
      } as any);

      await expect(isLearnFromLabelsEnabled("email-account-id")).resolves.toBe(
        true,
      );
    });

    it("is off when the account is missing", async () => {
      vi.mocked(prisma.emailAccount.findUnique).mockResolvedValue(null);

      await expect(isLearnFromLabelsEnabled("email-account-id")).resolves.toBe(
        false,
      );
    });
  });

  describe("learnSenderFromLabel", () => {
    it("learns the sender for an existing rule without creating one", async () => {
      await learnSenderFromLabel({ ...baseArgs, ruleId: "rule-123" });

      expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({
          emailAccountId: "email-account-id",
          from: "sender@example.com",
          ruleId: "rule-123",
          exclude: false,
          messageId: "123",
          threadId: "thread-123",
          source: GroupItemSource.LABEL_ADDED,
        }),
      );
    });

    it("creates a label-only rule when the email stayed in the inbox", async () => {
      vi.mocked(mockProvider.getMessage).mockResolvedValue({
        labelIds: ["INBOX", "Label_1"],
      });

      await learnSenderFromLabel({ ...baseArgs, ruleId: null });

      expect(createRuleWithResolvedActions).toHaveBeenCalledWith({
        emailAccountId: "email-account-id",
        data: { name: "Receipts", enabled: true, runOnThreads: false },
        actions: [
          { type: ActionType.LABEL, label: "Receipts", labelId: "Label_1" },
        ],
      });
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "new-rule-id" }),
      );
    });

    it("creates a label-and-archive rule when the email was moved out of the inbox", async () => {
      await learnSenderFromLabel({ ...baseArgs, ruleId: undefined });

      expect(createRuleWithResolvedActions).toHaveBeenCalledWith(
        expect.objectContaining({
          actions: [
            { type: ActionType.LABEL, label: "Receipts", labelId: "Label_1" },
            { type: ActionType.ARCHIVE },
          ],
        }),
      );
      expect(saveLearnedPattern).toHaveBeenCalledWith(
        expect.objectContaining({ ruleId: "new-rule-id" }),
      );
    });

    it("does not learn when the label cannot be read", async () => {
      vi.mocked(mockProvider.getLabelById).mockResolvedValue(null);

      await learnSenderFromLabel({ ...baseArgs, ruleId: null });

      expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("does not learn when a rule already has the label's name but does not label with it", async () => {
      vi.mocked(prisma.rule.findUnique).mockResolvedValue({
        id: "other-rule",
      } as any);

      await learnSenderFromLabel({ ...baseArgs, ruleId: null });

      expect(createRuleWithResolvedActions).not.toHaveBeenCalled();
      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });

    it("does not learn when rule creation fails", async () => {
      vi.mocked(createRuleWithResolvedActions).mockRejectedValueOnce(
        new Error("boom"),
      );

      await learnSenderFromLabel({ ...baseArgs, ruleId: null });

      expect(saveLearnedPattern).not.toHaveBeenCalled();
    });
  });
});
