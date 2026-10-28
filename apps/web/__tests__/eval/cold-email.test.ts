import { afterAll, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { coldEmailCases } from "@/__tests__/eval/cold-email-cases";
import {
  formatLoadIssues,
  getEvalDataDirs,
  loadEvalCases,
} from "@/__tests__/eval/harness/load-cases";
import { getEmail } from "@/__tests__/helpers";
import { createMockEmailProvider } from "@/utils/__mocks__/email-provider";
import { createScopedLogger } from "@/utils/logger";
import { PREVIOUS_DEFAULT_COLD_EMAIL_PROMPT } from "@/__tests__/eval/cold-email-previous-prompt";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";

// pnpm test-ai eval/cold-email
// Multi-model: EVAL_MODELS=gpt-6-luna,deepseek-v4-flash pnpm test-ai eval/cold-email
// Extra cases: EVAL_DATA_DIRS=/path/to/datasets (reads its "cold-email/" folder)
//
// Every case runs under two prompts so a prompt change can be measured:
//   current  = DEFAULT_COLD_EMAIL_PROMPT (what the code ships; asserted)
//   previous = the exact default most accounts were running before the rewrite
//              (recorded for comparison only, never fails the suite)

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 180_000;
const logger = createScopedLogger("eval-cold-email");

// Every sender is a stranger: the eval measures the AI step, not prior-contact short-circuits.
const provider = createMockEmailProvider({
  hasPreviousCommunicationsWithSenderOrDomain: async () => false,
});

// Slower providers time out when every case fires at once.
vi.setConfig({ maxConcurrency: 3 });

const externalCaseSchema = z.object({
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

const dataDirs = getEvalDataDirs();
const externalCases = dataDirs.length
  ? loadEvalCases({
      suite: "cold-email",
      schema: externalCaseSchema,
      roots: dataDirs,
    })
  : null;

const cases = [
  ...coldEmailCases,
  ...(externalCases?.cases ?? []).map((testCase) => ({
    name: `external: ${testCase.id}`,
    category: testCase.category,
    expected: testCase.expected,
    // Undated mail skips the AI check: the prior-contact guard assumes contact.
    email: getEmail({
      ...testCase.email,
      date: new Date("2026-04-21T10:00:00Z"),
    }),
  })),
];

const promptVariants = [
  { label: "current", instructions: null },
  { label: "previous", instructions: PREVIOUS_DEFAULT_COLD_EMAIL_PROMPT },
] as const;

type Outcome = {
  model: string;
  variant: string;
  name: string;
  category: string;
  expected: (typeof coldEmailCases)[number]["expected"];
  actual: boolean;
  reason: string | null | undefined;
};

describe.runIf(shouldRunEval)("Eval: cold email", () => {
  const evalReporter = createEvalReporter({ evalName: "cold-email" });
  const outcomes: Outcome[] = [];

  if (externalCases) {
    test("external cases load cleanly", () => {
      expect(formatLoadIssues(externalCases.issues)).toBe("");
    });
  }

  describeEvalMatrix("cold email", (model, emailAccount) => {
    for (const variant of promptVariants) {
      for (const testCase of cases) {
        test.concurrent(
          `${variant.label} | ${testCase.name}`,
          async () => {
            const result = await isColdEmail({
              logger,
              email: testCase.email,
              emailAccount,
              provider,
              coldEmailRule: variant.instructions
                ? { instructions: variant.instructions, groupId: null }
                : null,
            });

            outcomes.push({
              model: model.label,
              variant: variant.label,
              name: testCase.name,
              category: testCase.category,
              expected: testCase.expected,
              actual: result.isColdEmail,
              reason: result.aiReason,
            });

            // Borderline cases only appear in the custom summary so the
            // reporter's totals cover scored cases alone.
            if (testCase.expected === "either") return;

            evalReporter.record({
              testName: `${variant.label} | ${testCase.name}`,
              model: model.label,
              pass: result.isColdEmail === testCase.expected,
              actual: String(result.isColdEmail),
              expected: String(testCase.expected),
            });

            // The previous prompt is a comparison baseline, not a gate.
            if (variant.label === "current") {
              expect(result.isColdEmail).toBe(testCase.expected);
            }
          },
          TIMEOUT,
        );
      }
    }
  });

  afterAll(() => {
    logger.info(summarizeOutcomes(outcomes));
    evalReporter.printReport();
  });
});

function summarizeOutcomes(outcomes: Outcome[]) {
  const scored = outcomes.filter((o) => o.expected !== "either");
  const groups = new Map<string, Outcome[]>();
  for (const o of scored) {
    const key = `${o.model} | ${o.variant}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }

  const lines = ["", "Cold email eval: accuracy by model and prompt", ""];
  for (const [key, group] of groups) {
    const correct = group.filter((o) => o.actual === o.expected).length;
    const falseCold = group.filter((o) => o.actual && !o.expected);
    const missedCold = group.filter((o) => !o.actual && o.expected);
    lines.push(
      `${key}: ${correct}/${group.length} correct, ${falseCold.length} wrongly cold, ${missedCold.length} missed cold`,
    );
    for (const o of [...falseCold, ...missedCold]) {
      lines.push(`  - ${o.actual ? "wrongly cold" : "missed cold"}: ${o.name}`);
    }
  }

  const either = outcomes.filter((o) => o.expected === "either");
  if (either.length) {
    lines.push("", "Borderline cases (not scored):");
    for (const o of either) {
      lines.push(
        `  ${o.model} | ${o.variant} | ${o.name}: ${o.actual ? "cold" : "not cold"}`,
      );
    }
  }
  return lines.join("\n");
}
