import { beforeEach, describe, expect, it, vi } from "vitest";
import { GroupItemSource, SystemType } from "@/generated/prisma/enums";
import {
  removeAiLearnedPattern,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";
import { recordLabelRemovalLearning } from "./record-label-removal-learning";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("@/utils/rule/learned-patterns", () => ({
  saveLearnedPattern: vi.fn().mockResolvedValue(undefined),
  removeAiLearnedPattern: vi.fn().mockResolvedValue(0),
}));

const logger = createTestLogger();

describe("recordLabelRemovalLearning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(saveLearnedPattern).mockResolvedValue(undefined);
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
});
