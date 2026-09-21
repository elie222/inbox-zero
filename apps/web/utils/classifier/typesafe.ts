import { z } from "zod";
import type {
  ClassifierConfig,
  ClassifierQuestion,
  ClassifierResponse,
} from "@/utils/classifier/classify";

const TYPESAFE_API_URL = "https://api.typesafe.ai/v1/systemone";
const TYPESAFE_TIMEOUT_MS = 30_000;

const probabilitySchema = z.number().min(0).max(1);

const typeSafeResponseSchema = z.object({
  model: z.string(),
  usage: z.object({ input_tokens: z.number().int().nonnegative() }),
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

export async function classifyWithTypeSafe({
  config,
  state,
  questions,
}: {
  config: ClassifierConfig;
  state: Record<string, unknown>;
  questions: Record<string, ClassifierQuestion>;
}): Promise<ClassifierResponse> {
  const response = await fetch(TYPESAFE_API_URL, {
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
            ? { type: "noul", instructions: question.instructions }
            : question,
        ]),
      ),
    }),
    signal: AbortSignal.timeout(TYPESAFE_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`TypeSafe request failed with status ${response.status}`);
  }

  const body = typeSafeResponseSchema.parse(await response.json());

  return {
    model: body.model,
    inputTokens: body.usage.input_tokens,
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
