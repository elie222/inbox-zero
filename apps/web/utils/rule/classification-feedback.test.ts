import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  saveClassificationFeedback,
  getClassificationFeedback,
  findRuleByLabelId,
} from "./classification-feedback";
import { ClassificationFeedbackEventType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("@/utils/prisma", () => ({
  default: {
    classificationFeedback: {
      upsert: vi.fn().mockResolvedValue({}),
      findMany: vi.fn().mockResolvedValue([]),
    },
    rule: {
      findFirst: vi.fn(),
    },
  },
}));

const logger = createScopedLogger("test");

describe("saveClassificationFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes sender to lowercase", async () => {
    await saveClassificationFeedback({
      emailAccountId: "acc-1",
      sender: "User@Example.COM",
      ruleId: "rule-1",
      threadId: "thread-1",
      messageId: "msg-1",
      eventType: ClassificationFeedbackEventType.LABEL_ADDED,
      logger,
    });

    expect(prisma.classificationFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          sender: "user@example.com",
        }),
      }),
    );
  });
});

describe("getClassificationFeedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no feedback exists", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([]);

    const result = await getClassificationFeedback({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: { getMessagesBatch: vi.fn() } as any,
      logger,
    });

    expect(result).toBeNull();
  });

  it("normalizes sender email to lowercase for query", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([]);

    await getClassificationFeedback({
      emailAccountId: "acc-1",
      senderEmail: "Test@EXAMPLE.com",
      provider: { getMessagesBatch: vi.fn() } as any,
      logger,
    });

    expect(prisma.classificationFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sender: "test@example.com",
          rule: { enabled: true },
        }),
      }),
    );
  });

  it("returns structured items with subjects from batch fetch", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([
      {
        messageId: "msg-1",
        eventType: ClassificationFeedbackEventType.LABEL_ADDED,
        rule: { name: "Receipt" },
      },
      {
        messageId: "msg-2",
        eventType: ClassificationFeedbackEventType.LABEL_ADDED,
        rule: { name: "Marketing" },
      },
    ] as any);

    const mockProvider = {
      getMessagesBatch: vi.fn().mockResolvedValue([
        { id: "msg-1", headers: { subject: "Your order has shipped" } },
        { id: "msg-2", headers: { subject: "Spring sale: 40% off" } },
      ]),
    } as any;

    const result = await getClassificationFeedback({
      emailAccountId: "acc-1",
      senderEmail: "amazon@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).toEqual([
      {
        subject: "Your order has shipped",
        ruleName: "Receipt",
        eventType: "LABEL_ADDED",
      },
      {
        subject: "Spring sale: 40% off",
        ruleName: "Marketing",
        eventType: "LABEL_ADDED",
      },
    ]);
  });

  it("returns null subject for LABEL_REMOVED events with missing messages", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([
      {
        messageId: "msg-1",
        eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
        rule: { name: "Newsletter" },
      },
    ] as any);

    const mockProvider = {
      getMessagesBatch: vi.fn().mockResolvedValue([]),
    } as any;

    const result = await getClassificationFeedback({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).toEqual([
      { subject: null, ruleName: "Newsletter", eventType: "LABEL_REMOVED" },
    ]);
  });

  it("handles batch fetch failure gracefully", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([
      {
        messageId: "msg-1",
        eventType: ClassificationFeedbackEventType.LABEL_ADDED,
        rule: { name: "Receipt" },
      },
    ] as any);

    const mockProvider = {
      getMessagesBatch: vi.fn().mockRejectedValue(new Error("API error")),
    } as any;

    const result = await getClassificationFeedback({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).toEqual([
      { subject: null, ruleName: "Receipt", eventType: "LABEL_ADDED" },
    ]);
  });
});

describe("findRuleByLabelId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns rule matching the label action", async () => {
    vi.mocked(prisma.rule.findFirst).mockResolvedValue({
      id: "rule-1",
      systemType: "NEWSLETTER",
    } as any);

    const result = await findRuleByLabelId({
      labelId: "label-123",
      emailAccountId: "acc-1",
    });

    expect(result).toEqual({ id: "rule-1", systemType: "NEWSLETTER" });
    expect(prisma.rule.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "acc-1",
        enabled: true,
        actions: {
          some: {
            labelId: "label-123",
            type: "LABEL",
          },
        },
      },
      select: { id: true, systemType: true },
    });
  });

  it("returns null when no rule matches", async () => {
    vi.mocked(prisma.rule.findFirst).mockResolvedValue(null);

    const result = await findRuleByLabelId({
      labelId: "unknown-label",
      emailAccountId: "acc-1",
    });

    expect(result).toBeNull();
  });
});
