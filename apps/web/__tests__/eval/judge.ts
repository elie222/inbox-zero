import { z } from "zod";
import { generateObject } from "ai";
import { writeEvalDebugArtifact } from "@/__tests__/eval/debug-artifacts";
import { getModel } from "@/utils/llms/model";
import type { UserAIFields } from "@/utils/llms/types";

export interface JudgeCriterion {
  description?: string;
  name: string;
}

export interface JudgeResult {
  criterion: string;
  pass: boolean;
  reasoning: string;
}

const judgeSchema = z.object({
  pass: z.boolean().describe("Whether the output passes the criterion"),
  reasoning: z.string().describe("Brief explanation of the verdict"),
});

/**
 * Binary pass/fail LLM-as-judge evaluation.
 *
 * Uses the default env-configured model as the judge.
 * For cross-model fairness, the judge should be a different model
 * than the ones being evaluated.
 */
export async function judgeBinary(options: {
  input: string;
  output: string;
  expected?: string;
  criterion: JudgeCriterion;
  judgeUserAi?: UserAIFields;
}): Promise<JudgeResult> {
  const { model, providerOptions } = getModel(
    options.judgeUserAi ?? {
      aiProvider: null,
      aiModel: null,
      aiApiKey: null,
    },
  );

  const system = [
    "You are an impartial judge evaluating AI-generated output.",
    "Determine whether the output PASSES or FAILS a specific criterion.",
    "Return a binary pass/fail decision. Do not use numeric scales.",
    "Think step by step, then give your verdict.",
  ].join("\n");

  const prompt = buildJudgePrompt(options);

  try {
    const result = await generateObject({
      model,
      system,
      prompt,
      schema: judgeSchema,
      providerOptions,
    });

    writeEvalDebugArtifact({
      kind: "judge-result",
      data: {
        criterion: options.criterion,
        input: options.input,
        output: options.output,
        expected: options.expected,
        judgeModel: options.judgeUserAi ?? {
          aiProvider: null,
          aiModel: null,
        },
        providerOptions,
        system,
        prompt,
        result,
      },
    });

    return {
      criterion: options.criterion.name,
      pass: result.object.pass,
      reasoning: result.object.reasoning,
    };
  } catch (error) {
    writeEvalDebugArtifact({
      kind: "judge-error",
      data: {
        criterion: options.criterion,
        input: options.input,
        output: options.output,
        expected: options.expected,
        judgeModel: options.judgeUserAi ?? {
          aiProvider: null,
          aiModel: null,
        },
        providerOptions,
        system,
        prompt,
        error,
      },
    });

    return {
      criterion: options.criterion.name,
      pass: false,
      reasoning: `Judge error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Evaluates output against multiple criteria in parallel.
 * Returns individual results and an overall pass/fail.
 */
export async function judgeMultiple(options: {
  input: string;
  output: string;
  expected?: string;
  criteria: JudgeCriterion[];
  judgeUserAi?: UserAIFields;
}): Promise<{ results: JudgeResult[]; allPassed: boolean }> {
  const results = await Promise.all(
    options.criteria.map((criterion) => judgeBinary({ ...options, criterion })),
  );
  return { results, allPassed: results.every((r) => r.pass) };
}

export const CRITERIA = {
  ACCURACY: {
    name: "Accuracy",
    description:
      "The output contains only factually correct information based on the input. No hallucinated names, dates, or facts.",
  },
  COMPLETENESS: {
    name: "Completeness",
    description:
      "The output addresses all key points from the input that need addressing.",
  },
  TONE: {
    name: "Tone",
    description:
      "The tone is appropriate for the context (professional for work emails, casual for personal).",
  },
  CONCISENESS: {
    name: "Conciseness",
    description:
      "The output is appropriately brief without sacrificing clarity or important details.",
  },
  NO_HALLUCINATION: {
    name: "No Hallucination",
    description:
      "The output does not invent, fabricate, or assume facts not present in the input.",
  },
  CORRECT_FORMAT: {
    name: "Correct Format",
    description: "The output matches the expected format or structure.",
  },
} as const;

function buildJudgePrompt(options: {
  input: string;
  output: string;
  expected?: string;
  criterion: JudgeCriterion;
}): string {
  const parts = [
    "## Criterion",
    options.criterion.description
      ? `**${options.criterion.name}**: ${options.criterion.description}`
      : `**${options.criterion.name}**`,
    "",
    "## Input",
    options.input,
    "",
    "## AI Output",
    options.output,
  ];

  if (options.expected != null) {
    parts.push("", "## Expected Output", options.expected);
  }

  parts.push("", "Does the AI output PASS or FAIL this criterion?");

  return parts.join("\n");
}
