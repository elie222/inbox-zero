import { afterAll, describe, expect, test, vi } from "vitest";
import { coldEmailCases } from "@/__tests__/eval/cold-email-cases";
import { PREVIOUS_DEFAULT_COLD_EMAIL_PROMPT } from "@/__tests__/eval/cold-email-previous-prompt";
import {
  describeEvalMatrix,
  shouldRunEvalTests,
} from "@/__tests__/eval/models";
import { createEvalReporter } from "@/__tests__/eval/reporter";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";

// pnpm test-ai eval/cold-email
// Multi-model: EVAL_MODELS=gpt-5.6-luna,deepseek-v4-flash pnpm test-ai eval/cold-email
//
// Every case runs under two prompts so a prompt change can be measured:
//   current  = DEFAULT_COLD_EMAIL_PROMPT (what the code ships; asserted)
//   previous = the exact default most accounts were running before the rewrite
//              (recorded for comparison only, never fails the suite)

const shouldRunEval = shouldRunEvalTests();
const TIMEOUT = 180_000;

// Slower providers time out when every case fires at once.
vi.setConfig({ maxConcurrency: 3 });

const promptVariants = [
  { label: "current", instructions: null },
  { label: "previous", instructions: PREVIOUS_DEFAULT_COLD_EMAIL_PROMPT },
] as const;

type Outcome = {
  model: string;
  variant: string;
  name: string;
  category: string;
  expected: boolean | "either";
  actual: boolean;
  reason: string | null | undefined;
};

describe.runIf(shouldRunEval)("Eval: cold email", () => {
  const evalReporter = createEvalReporter({ evalName: "cold-email" });
  const outcomes: Outcome[] = [];

  describeEvalMatrix("cold email", (model, emailAccount) => {
    for (const variant of promptVariants) {
      for (const testCase of coldEmailCases) {
        test.concurrent(
          `${variant.label} | ${testCase.name}`,
          async () => {
            const result = await isColdEmail({
              email: testCase.email,
              emailAccount,
              provider: {
                hasPreviousCommunicationsWithSenderOrDomain: async () => false,
              } as any,
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
    console.log(summarizeOutcomes(outcomes));
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
