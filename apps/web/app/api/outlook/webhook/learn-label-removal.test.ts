import { beforeEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { GroupItemSource, SystemType } from "@/generated/prisma/enums";
import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { learnFromOutlookLabelRemoval } from "./learn-label-removal";

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

describe("learnFromOutlookLabelRemoval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([]);
    vi.mocked(prisma.action.findMany).mockResolvedValue([]);
    vi.mocked(saveLearnedPattern).mockResolvedValue(undefined);
  });

  it("learns exclusion when a previously applied label is removed", async () => {
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
      {
        rule: {
          id: "rule-1",
          systemType: SystemType.NEWSLETTER,
        },
        actionItems: [{ labelId: "label-newsletter", label: "Newsletter" }],
      },
    ] as any);

    const message = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: ["INBOX"],
      headers: { from: "sender@example.com" },
    });

    await learnFromOutlookLabelRemoval({
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
        actionItems: [{ labelId: "label-newsletter", label: "Newsletter" }],
      },
    ] as any);

    const message = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: ["INBOX", "label-newsletter"],
      headers: { from: "sender@example.com" },
    });

    await learnFromOutlookLabelRemoval({
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
        actionItems: [{ labelId: "label-to-reply", label: "To Reply" }],
      },
    ] as any);

    const message = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: ["INBOX"],
      headers: { from: "sender@example.com" },
    });

    await learnFromOutlookLabelRemoval({
      message,
      emailAccountId: "email-account-123",
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("skips learning when label state is missing", async () => {
    const message = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: undefined,
      headers: { from: "sender@example.com" },
    });

    await learnFromOutlookLabelRemoval({
      message,
      emailAccountId: "email-account-123",
      logger,
    });

    expect(prisma.executedRule.findMany).not.toHaveBeenCalled();
    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });

  it("deduplicates learning calls by rule id", async () => {
    vi.mocked(prisma.executedRule.findMany).mockResolvedValue([
      {
        rule: {
          id: "rule-1",
          systemType: SystemType.NEWSLETTER,
        },
        actionItems: [{ labelId: "label-newsletter", label: "Newsletter" }],
      },
      {
        rule: {
          id: "rule-1",
          systemType: SystemType.NEWSLETTER,
        },
        actionItems: [{ labelId: "label-newsletter", label: "Newsletter" }],
      },
    ] as any);

    const message = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: ["INBOX"],
      headers: { from: "sender@example.com" },
    });

    await learnFromOutlookLabelRemoval({
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
        actionItems: [{ labelId: null, label: "Newsletter" }],
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

    await learnFromOutlookLabelRemoval({
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
        actionItems: [{ labelId: null, label: "Newsletter" }],
      },
    ] as any);
    vi.mocked(prisma.action.findMany).mockResolvedValue([]);

    const message = getMockParsedMessage({
      id: "message-123",
      threadId: "thread-123",
      labelIds: ["INBOX", "label-newsletter-id"],
      headers: { from: "sender@example.com" },
    });

    await learnFromOutlookLabelRemoval({
      message,
      emailAccountId: "email-account-123",
      logger,
    });

    expect(saveLearnedPattern).not.toHaveBeenCalled();
  });
});
