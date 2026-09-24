import { afterAll, describe, test } from "vitest";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import {
  ReplyMemoryKind,
  ReplyMemoryScopeType,
} from "@/generated/prisma/enums";
import { selectRelevantReplyMemoriesWithLlmStrict } from "@/utils/ai/reply/select-reply-memories";
import { decideRelevantReplyMemories } from "@/utils/decision-model/reply-memory-selection";
import {
  compareDecision,
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

const candidates = [
  {
    id: "pricing",
    content: "The Pro plan costs $49 per month.",
    kind: ReplyMemoryKind.FACT,
    scopeType: ReplyMemoryScopeType.TOPIC,
    scopeValue: "pricing",
  },
  {
    id: "shipping",
    content: "Ask for a tracking number when shipments are delayed.",
    kind: ReplyMemoryKind.PROCEDURE,
    scopeType: ReplyMemoryScopeType.TOPIC,
    scopeValue: "shipping",
  },
  {
    id: "acme-tone",
    content:
      "For Acme, keep replies concise and include the support ticket number.",
    kind: ReplyMemoryKind.INSTRUCTION,
    scopeType: ReplyMemoryScopeType.SENDER,
    scopeValue: "acme.example",
  },
];

const cases = [
  {
    name: "selects a directly answering fact",
    emailContent: "How much does the Pro plan cost?",
    expected: ["pricing"],
  },
  {
    name: "selects a triggered procedure",
    emailContent: "My shipment is a week late and still has not arrived.",
    expected: ["shipping"],
  },
  {
    name: "selects sender-specific guidance",
    emailContent:
      "From: buyer@acme.example\nSubject: Ticket ACME-42\nCan you update me on this support request?",
    expected: ["acme-tone"],
  },
  {
    name: "rejects unrelated memories",
    emailContent: "Can you confirm tomorrow's meeting time?",
    expected: [],
  },
];

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model reply memory selection",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-reply-memory-selection",
    });

    for (const testCase of cases) {
      test(
        testCase.name,
        async () => {
          await compareDecision({
            testName: testCase.name,
            expected: testCase.expected,
            runJev: async () =>
              (
                await decideRelevantReplyMemories({
                  config: decisionModelConfig,
                  candidates,
                  emailContent: testCase.emailContent,
                  emailAccount: lunaEmailAccount,
                  logger: decisionModelEvalLogger,
                })
              ).sort(),
            runLuna: async () =>
              (
                await selectRelevantReplyMemoriesWithLlmStrict({
                  candidates,
                  emailContent: testCase.emailContent,
                  emailAccount: lunaEmailAccount,
                })
              ).sort(),
            reporter,
          });
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    afterAll(() => reporter.printReport());
  },
);
