import { expect } from "vitest";
import {
  EVAL_MODEL_CATALOG,
  getEmailAccountForModel,
} from "@/__tests__/eval/model-catalog";
import { shouldRunEvalTests } from "@/__tests__/eval/models";
import type { createEvalReporter } from "@/__tests__/eval/reporter";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

export const shouldRunDecisionModelEvals =
  shouldRunEvalTests() && !!env.TYPESAFE_API_KEY && !!env.OPENROUTER_API_KEY;
export const DECISION_MODEL_EVAL_TIMEOUT = 60_000;
export const decisionModelEvalLogger = createScopedLogger(
  "eval-decision-model-comparison",
);
export const lunaEmailAccount = getEmailAccountForModel(
  EVAL_MODEL_CATALOG["gpt-6-luna"],
);
export const decisionModelConfig = {
  provider: "typesafe" as const,
  model: "jev-latest",
  apiKey: env.TYPESAFE_API_KEY ?? "",
};

export async function compareDecision<T>({
  testName,
  expected,
  runJev,
  runLuna,
  reporter,
}: {
  testName: string;
  expected: T;
  runJev: () => Promise<T>;
  runLuna: () => Promise<T>;
  reporter: ReturnType<typeof createEvalReporter>;
}) {
  const [jev, luna] = await Promise.all([runJev(), runLuna()]);

  recordResult({ reporter, testName, model: "JEV", actual: jev, expected });
  recordResult({
    reporter,
    testName,
    model: "GPT-6 Luna",
    actual: luna,
    expected,
  });

  expect(jev).toEqual(expected);
  expect(luna).toEqual(expected);
}

function recordResult<T>({
  reporter,
  testName,
  model,
  actual,
  expected,
}: {
  reporter: ReturnType<typeof createEvalReporter>;
  testName: string;
  model: string;
  actual: T;
  expected: T;
}) {
  const actualText = formatValue(actual);
  const expectedText = formatValue(expected);
  reporter.record({
    testName,
    model,
    pass: actualText === expectedText,
    expected: expectedText,
    actual: actualText,
  });
}

function formatValue(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value);
}
