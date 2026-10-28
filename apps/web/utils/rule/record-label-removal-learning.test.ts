import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassificationFeedbackEventType,
  GroupItemSource,
  SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import {
  removeAiLearnedPattern,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";
import {
  BULK_LABEL_REMOVAL_THRESHOLD,
  getBulkRemovedLabelIds,
  recordLabelRemovalLearning,
} from "./record-label-removal-learning";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/prisma");
vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
  removeAiLearnedPattern: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/utils/rule/classification-feedback", () => ({
  saveClassificationFeedback: vi
    .fn()
    .mockResolvedValue({ createdAt: new Date("2026-01-01T12:00:00Z") }),
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
  afterEach(() => {
    vi.useRealTimers();
  });
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

    expect(removeAiLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: removal.emailAccountId,
      from: removal.sender,
      ruleId: removal.ruleId,
    });

    expect(saveClassificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "rule-1",
        messageId: "message-2",
        eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      }),
    );
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("removes a custom rule's inferred pattern even when saving feedback fails", async () => {
    const error = new Error("Feedback unavailable");
    vi.mocked(saveClassificationFeedback).mockRejectedValueOnce(error);

    await expect(
      recordLabelRemovalLearning({ ...removal, systemType: null }),
    ).rejects.toThrow(error);

    expect(removeAiLearnedPattern).toHaveBeenCalledWith({
      emailAccountId: removal.emailAccountId,
      from: removal.sender,
      ruleId: removal.ruleId,
    });
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("records the first removal from a sender as feedback only", async () => {
    await recordLabelRemovalLearning(removal);

    expect(saveClassificationFeedback).toHaveBeenCalledTimes(1);
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("learns an exclusion once the sender was removed on a separate occasion", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:00:00Z"));
    const windowStart = new Date("2026-01-01T11:45:00Z");
    prisma.classificationFeedback.findFirst.mockResolvedValue(earlierRemoval);

    await recordLabelRemovalLearning(removal);

    expect(prisma.classificationFeedback.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: {
            gte: windowStart,
            lte: new Date("2026-01-01T12:00:00Z"),
          },
        }),
      }),
    );
    expect(prisma.classificationFeedback.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          emailAccountId: "email-account-1",
          ruleId: "rule-1",
          sender: "sender@example.com",
          eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
          messageId: { not: "message-2" },
          createdAt: { lt: windowStart },
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

  it("does not turn same-occasion removals into an exclusion on a delayed retry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-01-01T12:30:00Z"));
    const firstRemovalAt = new Date("2026-01-01T11:55:00Z");
    prisma.classificationFeedback.findFirst.mockImplementation(async (args) => {
      const cutoff = (args?.where?.createdAt as { lt: Date }).lt;
      return firstRemovalAt < cutoff ? earlierRemoval : null;
    });

    await recordLabelRemovalLearning(removal);

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("retries exclusion learning after feedback was saved but learning failed", async () => {
    prisma.classificationFeedback.findFirst.mockResolvedValue(earlierRemoval);
    vi.mocked(saveLearnedPattern).mockRejectedValueOnce(
      new Error("Learning unavailable"),
    );

    await expect(recordLabelRemovalLearning(removal)).rejects.toThrow(
      "Learning unavailable",
    );
    await recordLabelRemovalLearning(removal);

    expect(saveLearnedPattern).toHaveBeenCalledTimes(2);
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
