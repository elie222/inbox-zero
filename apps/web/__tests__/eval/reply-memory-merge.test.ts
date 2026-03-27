import { afterAll, describe, expect, test, vi } from "vitest";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import { aiFindMatchingReplyMemoryId } from "@/utils/ai/reply/match-reply-memory";

// pnpm test-ai eval/reply-memory-merge
// Multi-model: EVAL_MODELS=all pnpm test-ai eval/reply-memory-merge

vi.mock("server-only", () => ({}));

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 45_000;
const evalReporter = createEvalReporter();

const testCases = [
  {
    name: "matches a paraphrased demo qualification procedure",
    memory: {
      content:
        "Before booking a demo, first ask how large the team is and which workflow they want to see.",
      kind: ReplyMemoryKind.PROCEDURE,
      scopeType: ReplyMemoryScopeType.TOPIC,
    },
    normalizedScopeValue: "demos",
    candidates: [
      {
        id: "demo-qualification",
        content:
          "For demo requests, ask for team size and the main workflow before suggesting times.",
      },
      {
        id: "demo-calendar-link",
        content: "For demo requests, send the calendar link immediately.",
      },
    ],
    expected: "demo-qualification",
  },
  {
    name: "matches a cross-language pricing fact",
    memory: {
      content:
        "El precio enterprise depende del numero de asientos y de si el cliente quiere facturacion anual.",
      kind: ReplyMemoryKind.FACT,
      scopeType: ReplyMemoryScopeType.TOPIC,
    },
    normalizedScopeValue: "pricing",
    candidates: [
      {
        id: "pricing-annual-billing",
        content:
          "Enterprise pricing depends on seat count and whether the customer wants annual billing.",
      },
      {
        id: "pricing-free-trial",
        content: "Offer a free trial before discussing paid pricing.",
      },
    ],
    expected: "pricing-annual-billing",
  },
  {
    name: "keeps related but distinct pricing facts separate",
    memory: {
      content:
        "When asked about enterprise pricing, mention that implementation fees are quoted separately from the subscription.",
      kind: ReplyMemoryKind.FACT,
      scopeType: ReplyMemoryScopeType.TOPIC,
    },
    normalizedScopeValue: "pricing",
    candidates: [
      {
        id: "pricing-annual-billing",
        content:
          "Enterprise pricing depends on seat count and whether the customer wants annual billing.",
      },
      {
        id: "pricing-procurement",
        content:
          "Procurement review starts only after the customer confirms budget and timeline.",
      },
    ],
    expected: null,
  },
] as const;

describe.runIf(shouldRunEval)("reply memory merge eval", () => {
  describeEvalMatrix("reply memory merge", (model, emailAccount) => {
    const replyMemoryEmailAccount = emailAccount as Parameters<
      typeof aiFindMatchingReplyMemoryId
    >[0]["emailAccount"];

    for (const testCase of testCases) {
      test(
        testCase.name,
        async () => {
          const result = await aiFindMatchingReplyMemoryId({
            emailAccount: replyMemoryEmailAccount,
            memory: testCase.memory,
            normalizedScopeValue: testCase.normalizedScopeValue,
            candidates: [...testCase.candidates],
          });

          const pass = result === testCase.expected;

          evalReporter.record({
            testName: testCase.name,
            model: model.label,
            pass,
            expected: testCase.expected ?? "null",
            actual: result ?? "null",
          });

          expect(result).toBe(testCase.expected);
        },
        TIMEOUT,
      );
    }
  });

  afterAll(() => {
    evalReporter.printReport();
  });
});
