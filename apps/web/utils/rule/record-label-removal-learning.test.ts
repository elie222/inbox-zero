import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassificationFeedbackEventType,
  GroupItemSource,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import {
  BULK_LABEL_REMOVAL_THRESHOLD,
  getBulkRemovedLabelIds,
  recordLabelRemovalLearning,
} from "./record-label-removal-learning";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/utils/rule/classification-feedback", () => ({
  saveClassificationFeedback: vi.fn().mockResolvedValue(undefined),
}));

const logger = createTestLogger();

const removal = {
  sender: "Sender@example.com",
  ruleId: "rule-1",
  systemType: SystemType.NEWSLETTER,
  messageId: "message-2",
  threadId: "thread-2",
  emailAccountId: "email-account-1",
  logger,
};

const earlierRemoval = { id: "feedback-1" } as Awaited<
  ReturnType<typeof prisma.classificationFeedback.findFirst>
>;

describe("recordLabelRemovalLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.classificationFeedback.count.mockResolvedValue(1);
    prisma.classificationFeedback.findFirst.mockResolvedValue(null);
  });

  it("skips when sender is missing", async () => {
    await recordLabelRemovalLearning({ ...removal, sender: null });

    expect(saveClassificationFeedback).not.toHaveBeenCalled();
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("skips conversation-status rules entirely", async () => {
    await recordLabelRemovalLearning({
      ...removal,
      systemType: SystemType.TO_REPLY,
    });

    expect(saveClassificationFeedback).not.toHaveBeenCalled();
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("records feedback without an exclusion for custom rules", async () => {
    prisma.classificationFeedback.findFirst.mockResolvedValue(earlierRemoval);

    await recordLabelRemovalLearning({ ...removal, systemType: null });

    expect(saveClassificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "rule-1",
        messageId: "message-2",
        eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      }),
    );
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("records the first removal from a sender as feedback only", async () => {
    await recordLabelRemovalLearning(removal);

    expect(saveClassificationFeedback).toHaveBeenCalledTimes(1);
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("learns an exclusion once the sender was removed on a separate occasion", async () => {
    prisma.classificationFeedback.findFirst.mockResolvedValue(earlierRemoval);

    await recordLabelRemovalLearning(removal);

    expect(prisma.classificationFeedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailAccountId: "email-account-1",
          ruleId: "rule-1",
          sender: "sender@example.com",
          eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
          messageId: { not: "message-2" },
          createdAt: { lt: expect.any(Date) },
        }),
      }),
    );
    expect(saveLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: "email-account-1",
      from: "Sender@example.com",
      ruleId: "rule-1",
      exclude: true,
      logger,
      messageId: "message-2",
      threadId: "thread-2",
      reason: "Label removed",
      source: GroupItemSource.LABEL_REMOVED,
    });
  });

  it("records feedback but does not learn when the removal is flagged as bulk", async () => {
    prisma.classificationFeedback.findFirst.mockResolvedValue(earlierRemoval);

    await recordLabelRemovalLearning({ ...removal, isBulkRemoval: true });

    expect(saveClassificationFeedback).toHaveBeenCalledTimes(1);
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("does not learn when recent removals for the rule look like a sweep", async () => {
    prisma.classificationFeedback.count.mockResolvedValue(
      BULK_LABEL_REMOVAL_THRESHOLD,
    );
    prisma.classificationFeedback.findFirst.mockResolvedValue(earlierRemoval);

    await recordLabelRemovalLearning(removal);

    expect(saveClassificationFeedback).toHaveBeenCalledTimes(1);
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });
});

describe("getBulkRemovedLabelIds", () => {
  it("returns label ids removed at least the threshold number of times", () => {
    const removals = [
      ...Array.from({ length: BULK_LABEL_REMOVAL_THRESHOLD }, () => ({
        labelIds: ["label-swept", "label-once"],
      })),
    ];
    removals[0] = { labelIds: ["label-swept"] };

    const bulk = getBulkRemovedLabelIds(removals);

    expect(bulk.has("label-swept")).toBe(true);
    expect(bulk.has("label-once")).toBe(false);
  });
});
