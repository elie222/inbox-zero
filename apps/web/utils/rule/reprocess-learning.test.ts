import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ClassificationFeedbackEventType,
  GroupItemSource,
  SystemType,
} from "@/generated/prisma/enums";
import { createTestLogger } from "@/__tests__/helpers";
import {
  findRuleByLabelId,
  saveClassificationFeedback,
} from "@/utils/rule/classification-feedback";
import {
  retrainLearnedPatterns,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";
import { recordReprocessLearning } from "@/utils/rule/reprocess-learning";
import { fetchSenderFromMessage } from "@/utils/webhook/google/fetch-sender-from-message";

vi.mock("@/utils/rule/classification-feedback", () => ({
  findRuleByLabelId: vi.fn(),
  saveClassificationFeedback: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/rule/learned-patterns", () => ({
  retrainLearnedPatterns: vi.fn().mockResolvedValue(undefined),
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/utils/webhook/google/fetch-sender-from-message", () => ({
  fetchSenderFromMessage: vi.fn().mockResolvedValue("shawn@nucar.com"),
}));

const logger = createTestLogger();
const provider = {} as never;

const baseArgs = {
  emailAccountId: "email-account-id",
  provider,
  messageId: "message-1",
  threadId: "thread-1",
  logger,
};

describe("recordReprocessLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchSenderFromMessage).mockResolvedValue("shawn@nucar.com");
  });

  it("pins the sender to the kept folder's rule and excludes it from stripped rules", async () => {
    vi.mocked(findRuleByLabelId)
      .mockResolvedValueOnce({ id: "rule-keep", systemType: null } as never)
      .mockResolvedValueOnce({ id: "rule-old", systemType: null } as never);

    await recordReprocessLearning({
      ...baseArgs,
      keepLabelId: "label-keep",
      strippedLabelIds: ["label-old"],
    });

    expect(retrainLearnedPatterns).toHaveBeenCalledWith({
      emailAccountId: "email-account-id",
      ruleId: "rule-keep",
      values: ["shawn@nucar.com"],
      logger,
      reason: "Reprocess: user confirmed move",
      messageId: "message-1",
      threadId: "thread-1",
    });
    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "rule-old",
        from: "shawn@nucar.com",
        exclude: true,
        source: GroupItemSource.USER,
      }),
    );
    expect(saveClassificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "rule-keep",
        eventType: ClassificationFeedbackEventType.LABEL_ADDED,
      }),
    );
    expect(saveClassificationFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleId: "rule-old",
        eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      }),
    );
  });

  it("records exclusions on return-to-inbox (no kept folder)", async () => {
    vi.mocked(findRuleByLabelId).mockResolvedValue({
      id: "rule-misfiled",
      systemType: null,
    } as never);

    await recordReprocessLearning({
      ...baseArgs,
      keepLabelId: null,
      strippedLabelIds: ["label-misfiled"],
    });

    expect(retrainLearnedPatterns).not.toHaveBeenCalled();
    expect(saveLearnedPattern).toHaveBeenCalledWith(
      expect.objectContaining({ ruleId: "rule-misfiled", exclude: true }),
    );
  });

  it("skips stripped labels with no filing rule", async () => {
    vi.mocked(findRuleByLabelId).mockResolvedValue(null);

    await recordReprocessLearning({
      ...baseArgs,
      keepLabelId: null,
      strippedLabelIds: ["label-unknown"],
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
    expect(saveClassificationFeedback).not.toHaveBeenCalled();
  });

  it("does not learn exclusions for conversation-status system rules", async () => {
    vi.mocked(findRuleByLabelId).mockResolvedValue({
      id: "rule-to-reply",
      systemType: SystemType.TO_REPLY,
    } as never);

    await recordReprocessLearning({
      ...baseArgs,
      keepLabelId: null,
      strippedLabelIds: ["label-to-reply"],
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("does nothing when no sender can be resolved", async () => {
    vi.mocked(fetchSenderFromMessage).mockResolvedValue(null);

    await recordReprocessLearning({
      ...baseArgs,
      keepLabelId: "label-keep",
      strippedLabelIds: ["label-old"],
    });

    expect(findRuleByLabelId).not.toHaveBeenCalled();
    expect(retrainLearnedPatterns).not.toHaveBeenCalled();
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });
});
