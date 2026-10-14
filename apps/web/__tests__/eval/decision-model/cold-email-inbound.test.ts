import { afterAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { getEmail, getMockMessage } from "@/__tests__/helpers";
import { coldEmailCases } from "@/__tests__/eval/cold-email-cases";
import {
  formatLoadIssues,
  getEvalDataDirs,
  loadEvalCases,
} from "@/__tests__/eval/harness/load-cases";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { SystemType } from "@/generated/prisma/enums";
import { decisionModelChooseRule } from "@/utils/decision-model/choose-rule";
import type { DecisionModelResponse } from "@/utils/decision-model/decision-model";
import {
  CONVERSATION_TRACKING_INSTRUCTIONS,
  CONVERSATION_TRACKING_META_RULE_ID,
} from "@/utils/reply-tracker/conversation-status-config";
import { getRuleConfig } from "@/utils/rule/consts";
import type { ParsedMessage } from "@/utils/types";
import {
  DECISION_MODEL_EVAL_TIMEOUT,
  decisionModelConfig,
  decisionModelEvalLogger,
  lunaEmailAccount,
  shouldRunDecisionModelEvals,
} from "./helpers";

// The inbound cold-email decision as it ships: asked alongside rule selection,
// with the default system rules as candidates.
//
// DEFAULT_DECISION_MODEL=typesafe:jev-1.13.0 pnpm --filter inbox-zero-ai test-ai __tests__/eval/decision-model/cold-email-inbound.test.ts
// Private cases: EVAL_DATA_DIRS=/path/to/datasets (reads its "cold-email/" folder)

const lastResponse = vi.hoisted(() => ({
  bySubject: new Map<string, DecisionModelResponse>(),
}));

vi.mock("@/utils/decision-model/decision-model", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/utils/decision-model/decision-model")
    >();
  return {
    ...actual,
    runDecisionModel: async (
      options: Parameters<typeof actual.runDecisionModel>[0],
    ) => {
      const response = await actual.runDecisionModel(options);
      const state = options.state as { email?: { subject?: string } };
      lastResponse.bySubject.set(state.email?.subject ?? "", response);
      return response;
    },
  };
});

vi.setConfig({ maxConcurrency: 6 });

const privateCaseSchema = z.object({
  id: z.string(),
  expected: z.union([z.boolean(), z.literal("either")]),
  category: z.string(),
  email: z.object({
    from: z.string(),
    to: z.string().optional(),
    subject: z.string(),
    content: z.string(),
    listUnsubscribe: z.string().optional(),
  }),
});

const roots = getEvalDataDirs();
const privateCases = roots.length
  ? loadEvalCases({ suite: "cold-email", schema: privateCaseSchema, roots })
  : null;

const cases = [
  ...coldEmailCases.map((testCase) => ({
    name: testCase.name,
    category: testCase.category,
    expected: testCase.expected,
    email: testCase.email,
  })),
  ...(privateCases?.cases ?? []).map((testCase) => ({
    name: `private: ${testCase.id}`,
    category: testCase.category,
    expected: testCase.expected,
    email: getEmail(testCase.email),
  })),
];

const categoryRules = [
  SystemType.NEWSLETTER,
  SystemType.MARKETING,
  SystemType.CALENDAR,
  SystemType.RECEIPT,
  SystemType.NOTIFICATION,
].map((systemType) => {
  const config = getRuleConfig(systemType);
  return {
    id: systemType,
    name: config.name,
    instructions: config.instructions,
    systemType,
  };
});

const rules = [
  ...categoryRules,
  {
    id: CONVERSATION_TRACKING_META_RULE_ID,
    name: "Conversations",
    instructions: CONVERSATION_TRACKING_INSTRUCTIONS,
    systemType: null,
  },
];

type Outcome = {
  name: string;
  expected: boolean | "either";
  probability: number | null;
  isCold: boolean;
};

describe.runIf(shouldRunDecisionModelEvals)(
  "Eval: decision model inbound cold email",
  () => {
    const reporter = createEvalReporter({
      evalName: "decision-model-cold-email-inbound",
    });
    const outcomes: Outcome[] = [];

    if (privateCases) {
      test("private cases load cleanly", () => {
        expect(formatLoadIssues(privateCases.issues)).toBe("");
      });
    }

    for (const testCase of cases) {
      test.concurrent(
        testCase.name,
        async () => {
          const result = await decisionModelChooseRule({
            decisionModel: decisionModelConfig,
            message: toParsedMessage(testCase.email),
            emailAccount: lunaEmailAccount,
            rules,
            coldEmailRule: {
              instructions: getRuleConfig(SystemType.COLD_EMAIL).instructions,
            },
            classificationFeedback: null,
            logger: decisionModelEvalLogger,
          });

          const answer = lastResponse.bySubject.get(testCase.email.subject)
            ?.answers.__cold_email__;
          const probability =
            answer?.type === "boolean" ? answer.probability : null;
          const isCold = result.type === "coldEmail";

          outcomes.push({
            name: testCase.name,
            expected: testCase.expected,
            probability,
            isCold,
          });

          if (testCase.expected === "either") return;

          reporter.record({
            testName: testCase.name,
            model: decisionModelConfig.modelId,
            pass: isCold === testCase.expected,
            expected: String(testCase.expected),
            actual: `${isCold} (${probability?.toFixed(2) ?? "n/a"})`,
          });

          expect(isCold).toBe(testCase.expected);
        },
        DECISION_MODEL_EVAL_TIMEOUT,
      );
    }

    afterAll(() => {
      reporter.printReport();
      printSummary(outcomes);
    });
  },
);

function printSummary(outcomes: Outcome[]) {
  const scored = outcomes.filter((o) => o.expected !== "either");
  const cold = scored.filter((o) => o.expected === true);
  const notCold = scored.filter((o) => o.expected === false);
  const lines = [
    "",
    "Inbound cold email (decision model)",
    `  cold caught:       ${cold.filter((o) => o.isCold).length}/${cold.length}`,
    `  not cold flagged:  ${notCold.filter((o) => o.isCold).length}/${notCold.length}`,
    "",
    "  expected  prob  case",
    ...[...outcomes]
      .sort((a, b) => (b.probability ?? -1) - (a.probability ?? -1))
      .map((o) => {
        const mark =
          o.expected === "either" ? " " : o.isCold === o.expected ? " " : "✗";
        return `${mark} ${String(o.expected).padEnd(8)} ${o.probability?.toFixed(2) ?? " n/a"}  ${o.name}`;
      }),
  ];
  console.info(lines.join("\n"));
}

function toParsedMessage(email: ReturnType<typeof getEmail>) {
  const message = getMockMessage({
    from: email.from,
    to: email.to,
    subject: email.subject,
    textPlain: email.content,
    textHtml: "",
  });
  return {
    ...message,
    headers: {
      ...message.headers,
      "list-unsubscribe": email.listUnsubscribe,
    },
  } as unknown as ParsedMessage;
}
