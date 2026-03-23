import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  saveClassificationFeedback,
  getClassificationFeedbackForPrompt,
  findRuleByLabelId,
} from "./classification-feedback";
import { ClassificationFeedbackEventType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

vi.mock("server-only", () => ({}));

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

  it("uses upsert with composite unique key for deduplication", async () => {
    await saveClassificationFeedback({
      emailAccountId: "acc-1",
      sender: "test@example.com",
      ruleId: "rule-1",
      threadId: "thread-1",
      messageId: "msg-1",
      eventType: ClassificationFeedbackEventType.LABEL_ADDED,
      logger,
    });

    expect(prisma.classificationFeedback.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          emailAccountId_sender_ruleId_messageId_eventType: {
            emailAccountId: "acc-1",
            sender: "test@example.com",
            ruleId: "rule-1",
            messageId: "msg-1",
            eventType: ClassificationFeedbackEventType.LABEL_ADDED,
          },
        },
        update: {},
      }),
    );
  });
});

describe("getClassificationFeedbackForPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when no classifications exist", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([]);

    const result = await getClassificationFeedbackForPrompt({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: { getMessagesBatch: vi.fn() } as any,
      logger,
    });

    expect(result).toBeNull();
  });

  it("normalizes sender email to lowercase for query", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([]);

    await getClassificationFeedbackForPrompt({
      emailAccountId: "acc-1",
      senderEmail: "Test@EXAMPLE.com",
      provider: { getMessagesBatch: vi.fn() } as any,
      logger,
    });

    expect(prisma.classificationFeedback.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sender: "test@example.com",
        }),
      }),
    );
  });

  it("formats classifications with subjects from batch fetch", async () => {
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

    const result = await getClassificationFeedbackForPrompt({
      emailAccountId: "acc-1",
      senderEmail: "amazon@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).toContain("Your order has shipped");
    expect(result).toContain("Receipt");
    expect(result).toContain("Spring sale: 40% off");
    expect(result).toContain("Marketing");
    expect(result).toContain("<classification_feedback>");
  });

  it("handles LABEL_REMOVED events in formatting", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([
      {
        messageId: "msg-1",
        eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
        rule: { name: "Newsletter" },
      },
    ] as any);

    const mockProvider = {
      getMessagesBatch: vi
        .fn()
        .mockResolvedValue([
          { id: "msg-1", headers: { subject: "Weekly digest" } },
        ]),
    } as any;

    const result = await getClassificationFeedbackForPrompt({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).toContain("removed from Newsletter");
  });

  it("handles deleted messages gracefully", async () => {
    vi.mocked(prisma.classificationFeedback.findMany).mockResolvedValue([
      {
        messageId: "msg-deleted",
        eventType: ClassificationFeedbackEventType.LABEL_ADDED,
        rule: { name: "Receipt" },
      },
    ] as any);

    const mockProvider = {
      getMessagesBatch: vi.fn().mockResolvedValue([]),
    } as any;

    const result = await getClassificationFeedbackForPrompt({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).toContain("email no longer available");
    expect(result).toContain("Receipt");
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

    const result = await getClassificationFeedbackForPrompt({
      emailAccountId: "acc-1",
      senderEmail: "test@example.com",
      provider: mockProvider,
      logger,
    });

    expect(result).not.toBeNull();
    expect(result).toContain("email no longer available");
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
