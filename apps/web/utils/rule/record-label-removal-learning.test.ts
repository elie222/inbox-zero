import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupItemSource, SystemType } from "@/generated/prisma/enums";
import {
  removeAiLearnedPattern,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";
import prisma from "@/utils/prisma";
import {
  BULK_LABEL_REMOVAL_THRESHOLD,
  getBulkRemovedLabelIds,
  recordLabelRemovalLearning,
} from "./record-label-removal-learning";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
  removeAiLearnedPattern: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    classificationFeedback: {
      count: vi.fn().mockResolvedValue(0),
    },
  },
}));

const logger = createTestLogger();

describe("recordLabelRemovalLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveLearnedPattern).mockResolvedValue(undefined);
    vi.mocked(prisma.classificationFeedback.count).mockResolvedValue(0);
  });

  it("skips when sender is missing", async () => {
    await recordLabelRemovalLearning({
      sender: null,
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("skips when rule type is not learnable", async () => {
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.TO_REPLY,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("records learning with shared label-removal defaults", async () => {
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      from: "sender@example.com",
      ruleId: "rule-1",
      exclude: true,
      logger,
      messageId: "message-1",
      threadId: "thread-1",
      reason: "Label removed",
      source: GroupItemSource.LABEL_REMOVED,
    });
  });

  it("drops the AI-learned pattern instead of excluding when a custom rule's label is removed", async () => {
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: null,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(removeAiLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      from: "sender@example.com",
      ruleId: "rule-1",
    });
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });
  it("skips when the removal was part of a bulk action in the same batch", async () => {
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      isBulkRemoval: true,
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
    expect(prisma.classificationFeedback.count).not.toHaveBeenCalled();
  });

  it("continues learning below the rolling-window threshold", async () => {
    vi.mocked(prisma.classificationFeedback.count).mockResolvedValue(
      BULK_LABEL_REMOVAL_THRESHOLD - 1,
    );
    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "rule-1", exclude: true }),
    );
  });

  it("skips when the rule already saw many removals in the recent window", async () => {
    vi.mocked(prisma.classificationFeedback.count).mockResolvedValue(
      BULK_LABEL_REMOVAL_THRESHOLD,
    );

    await recordLabelRemovalLearning({
      sender: "sender@example.com",
      ruleId: "rule-1",
      systemType: SystemType.NEWSLETTER,
      messageId: "message-1",
      threadId: "thread-1",
      emailAccountId: "email-account-1",
      logger,
    });

    expect(prisma.classificationFeedback.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        emailAccountId: "email-account-1",
        ruleId: "rule-1",
        eventType: "LABEL_REMOVED",
      }),
    });
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });
});

describe("getBulkRemovedLabelIds", () => {
  it("flags only labels removed from many messages in one history page", () => {
    const labelsRemoved = [
      ...Array.from({ length: BULK_LABEL_REMOVAL_THRESHOLD }, (_, i) => ({
        message: { id: `message-${i}` },
        labelIds: ["label-bulk", i === 0 ? "label-single" : "INBOX"],
      })),
      { labelIds: ["label-few"] },
      { labelIds: ["label-few"] },
    ];

    const bulk = getBulkRemovedLabelIds(labelsRemoved);

    expect(bulk.has("label-bulk")).toBe(true);
    expect(bulk.has("label-few")).toBe(false);
    expect(bulk.has("label-single")).toBe(false);
  });

  it("does not treat repeated history entries for one message as a bulk cleanup", () => {
    const removals = Array.from(
      { length: BULK_LABEL_REMOVAL_THRESHOLD },
      () => ({
        message: { id: "message-1", threadId: "thread-1" },
        labelIds: ["label-1", "label-1"],
      }),
    );

    expect(getBulkRemovedLabelIds(removals).size).toBe(0);
  });

  it("ignores entries without label ids", () => {
    expect(getBulkRemovedLabelIds([{ labelIds: null }, {}]).size).toBe(0);
  });
});
