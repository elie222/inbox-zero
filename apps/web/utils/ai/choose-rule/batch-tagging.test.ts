import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger, getEmailAccount } from "@/__tests__/helpers";
import type { ParsedMessage } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import {
  classifyTagBatch,
  tagBackfillBatch,
  validateBatchAssignments,
} from "./batch-tagging";

const { generate, execute } = vi.hoisted(() => ({
  generate: vi.fn(),
  execute: vi.fn(),
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/llms", () => ({ createGenerateObject: () => generate }));
vi.mock("@/utils/llms/model", () => ({ getModel: () => ({ model: {} }) }));
vi.mock("@/utils/ai/choose-rule/execute", () => ({ executeAct: execute }));

const emailAccount = getEmailAccount();
const logger = createTestLogger();
const messages = Array.from(
  { length: 10 },
  (_, index) =>
    ({
      id: `mail-${index}`,
      threadId: "shared-thread",
      internalDate: "1700000000000",
      headers: {
        from: `sender${index}@example.com`,
        to: "user@test.com",
        subject: `Message ${index}`,
      },
      textPlain: `Independent message ${index}`,
    }) as ParsedMessage,
);
const rules = [
  {
    id: "receipt",
    name: "Receipts",
    instructions: "Payment receipts",
    actions: [
      { type: "LABEL", label: "Receipts", labelId: "receipt-label" },
      { type: "DRAFT_EMAIL" },
    ],
  },
  {
    id: "newsletter",
    name: "Newsletters",
    instructions: "Newsletters",
    actions: [{ type: "LABEL", label: "Newsletters", labelId: "news-label" }],
  },
];

describe("bulk email tagging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generate.mockResolvedValue({
      object: {
        assignments: messages.map((_, emailIndex) => ({
          emailIndex,
          ruleIndexes: [emailIndex % 2],
        })),
      },
    });
    execute.mockResolvedValue("APPLIED");
  });

  it("classifies ten emails independently in a single protected backlog request", async () => {
    const assignments = await classifyTagBatch({
      emailAccount,
      messages,
      rules,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(assignments.map((item) => item.ruleIndexes)).toEqual(
      messages.map((_, i) => [i % 2]),
    );
    const request = generate.mock.calls[0][0];
    expect(request.headers).toEqual({ "x-inbox-zero-workload": "backfill" });
    expect(JSON.parse(request.prompt).emails).toHaveLength(10);
  });

  it("rejects incomplete, duplicate, or unoffered model assignments before applying any tags", () => {
    expect(() =>
      validateBatchAssignments([{ emailIndex: 0, ruleIndexes: [0] }], 2, 2),
    ).toThrow();
    expect(() =>
      validateBatchAssignments(
        [
          { emailIndex: 0, ruleIndexes: [0] },
          { emailIndex: 0, ruleIndexes: [1] },
        ],
        2,
        2,
      ),
    ).toThrow();
    expect(() =>
      validateBatchAssignments([{ emailIndex: 0, ruleIndexes: [2] }], 1, 2),
    ).toThrow();
  });

  it("saves different per-message tag decisions before writes and excludes draft actions", async () => {
    const saved = messages.map((message, i) => ({
      id: `execution-${i}`,
      messageId: message.id,
      reason: "Local bulk tagging v1",
      status: "PENDING",
      actionItems: [],
    }));
    prisma.executedRule.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(saved as never);
    prisma.rule.findMany.mockResolvedValue(rules as never);
    prisma.executedRule.create.mockResolvedValue({} as never);
    prisma.$transaction.mockResolvedValue([]);
    const provider = {
      getMessagesBatch: vi.fn().mockResolvedValue(messages),
    } as unknown as EmailProvider;
    const result = await tagBackfillBatch({
      emailAccount,
      messageIds: messages.map((item) => item.id),
      provider,
      logger,
    });
    expect(result).toMatchObject({
      processedIds: messages.map((item) => item.id),
      failedIds: [],
      aiBatchSize: 10,
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(prisma.executedRule.create).toHaveBeenCalledTimes(10);
    for (const [
      i,
      [write],
    ] of prisma.executedRule.create.mock.calls.entries()) {
      expect(write.data).toMatchObject({
        messageId: `mail-${i}`,
        ruleId: rules[i % 2].id,
        actionItems: {
          create: [
            {
              type: "LABEL",
              label: rules[i % 2].actions[0].label,
              labelId: rules[i % 2].actions[0].labelId,
            },
          ],
        },
      });
    }
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      execute.mock.invocationCallOrder[0],
    );
  });

  it("retries a saved failed label without spending another classification request", async () => {
    const saved = [
      {
        id: "saved",
        messageId: messages[0].id,
        reason: "Local bulk tagging v1; Action failures: LABEL",
        status: "ERROR",
        actionItems: [{ type: "LABEL" }],
      },
    ];
    prisma.executedRule.findMany.mockResolvedValue(saved as never);
    prisma.rule.findMany.mockResolvedValue([]);
    const provider = {
      getMessagesBatch: vi.fn().mockResolvedValue([messages[0]]),
    } as unknown as EmailProvider;
    const result = await tagBackfillBatch({
      emailAccount,
      messageIds: [messages[0].id],
      provider,
      logger,
    });
    expect(result).toMatchObject({
      processedIds: [messages[0].id],
      aiBatchSize: 0,
    });
    expect(generate).not.toHaveBeenCalled();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("keeps only the failed message pending after a partial provider failure", async () => {
    const saved = messages.slice(0, 2).map((message, i) => ({
      id: `saved-${i}`,
      messageId: message.id,
      reason: "Local bulk tagging v1",
      status: "PENDING",
      actionItems: [{ type: "LABEL" }],
    }));
    prisma.executedRule.findMany.mockResolvedValue(saved as never);
    prisma.rule.findMany.mockResolvedValue([]);
    execute
      .mockResolvedValueOnce("APPLIED")
      .mockRejectedValueOnce(new Error("Temporary provider failure"));
    const provider = {
      getMessagesBatch: vi.fn().mockResolvedValue(messages.slice(0, 2)),
    } as unknown as EmailProvider;
    const result = await tagBackfillBatch({
      emailAccount,
      messageIds: messages.slice(0, 2).map((item) => item.id),
      provider,
      logger,
    });
    expect(result.processedIds).toEqual([messages[0].id]);
    expect(result.failedIds).toEqual([messages[1].id]);
    expect(generate).not.toHaveBeenCalled();
  });
});
