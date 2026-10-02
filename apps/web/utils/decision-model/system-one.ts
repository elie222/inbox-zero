import { z } from "zod";
import type {
  DecisionModelConfig,
  DecisionModelResponse,
  DecisionQuestion,
} from "./decision-model";

const SYSTEM_ONE_API_URLS = {
  typesafe: "https://api.typesafe.ai/v1/systemone",
  openrouter: "https://openrouter.ai/api/v1/systemone",
};
const SYSTEM_ONE_TIMEOUT_MS = 30_000;

const probabilitySchema = z.number().min(0).max(1);

const systemOneResponseSchema = z.object({
  model: z.string(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative().optional().default(0),
  }),
  answers: z.record(
    z.string(),
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("choice"),
        choice: z.string(),
        confidence: probabilitySchema,
        probabilities: z.record(z.string(), probabilitySchema),
      }),
      z.object({ type: z.literal("noul"), noul: probabilitySchema }),
    ]),
  ),
});

export async function decideWithSystemOne({
  config,
  state,
  questions,
}: {
  config: DecisionModelConfig;
  state: Record<string, unknown>;
  questions: Record<string, DecisionQuestion>;
}): Promise<DecisionModelResponse> {
  const response = await fetch(SYSTEM_ONE_API_URLS[config.provider], {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      state,
      questions: Object.fromEntries(
        Object.entries(questions).map(([key, question]) => [
          key,
          question.type === "yesNo"
            ? {
                type: "noul",
                instructions: question.instructions,
                criteria: question.criteria,
              }
            : question,
        ]),
      ),
    }),
    signal: AbortSignal.timeout(SYSTEM_ONE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const provider = config.provider === "typesafe" ? "TypeSafe" : "OpenRouter";
    throw new Error(
      `${provider} request failed with status ${response.status}`,
    );
  }

  const body = systemOneResponseSchema.parse(await response.json());

  return {
    model: body.model,
    inputTokens: body.usage.input_tokens,
    outputTokens: body.usage.output_tokens,
    answers: Object.fromEntries(
      Object.entries(body.answers).map(([key, answer]) => [
        key,
        answer.type === "noul"
          ? { type: "yesNo", probability: answer.noul }
          : answer,
      ]),
    ),
  };
}
