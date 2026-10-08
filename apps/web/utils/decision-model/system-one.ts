import {
  APICallError,
  type Experimental_DecisionModelV4,
  type Experimental_DecisionModelV4Answer,
  type Experimental_DecisionModelV4Question,
} from "@ai-sdk/provider";
import { z } from "zod";

const REQUEST_TIMEOUT_MS = 30_000;

const probabilitySchema = z.number().min(0).max(1);

const systemOneResponseSchema = z.object({
  id: z.string().optional(),
  model: z.string(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative().optional().default(0),
    cost: z.number().nonnegative().optional(),
  }),
  answers: z.record(
    z.string(),
    z.discriminatedUnion("type", [
      z.object({
        type: z.literal("choice"),
        choice: z.string(),
        confidence: probabilitySchema.optional(),
        probabilities: z.record(z.string(), probabilitySchema),
      }),
      z.object({ type: z.literal("noul"), noul: probabilitySchema }),
    ]),
  ),
});

/**
 * TypeSafe's System One decision API, which OpenRouter also serves for every
 * decision model it hosts. Neither ships an AI SDK decision model yet.
 */
export function createSystemOneDecisionModel({
  provider,
  url,
  apiKey,
  modelId,
}: {
  provider: string;
  url: string;
  apiKey: string;
  modelId: string;
}): Experimental_DecisionModelV4 {
  return {
    specificationVersion: "v4",
    provider,
    modelId,
    supportedQuestionTypes: ["choice", "boolean"],
    async doDecide({ state, questions, headers, abortSignal }) {
      const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          ...headers,
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelId,
          state,
          questions: Object.fromEntries(
            Object.entries(questions).map(([id, question]) => [
              id,
              toSystemOneQuestion(question),
            ]),
          ),
        }),
        signal: abortSignal ? AbortSignal.any([abortSignal, timeout]) : timeout,
      });

      if (!response.ok) {
        // The request body is email content, so it stays out of the error.
        throw new APICallError({
          message: `${provider} decision request failed with status ${response.status}`,
          url,
          requestBodyValues: { model: modelId },
          statusCode: response.status,
        });
      }

      const body = systemOneResponseSchema.parse(await response.json());

      return {
        answers: Object.fromEntries(
          Object.entries(body.answers).map(([id, answer]) => [
            id,
            fromSystemOneAnswer(answer),
          ]),
        ),
        // Distributions arrive rounded, and precision varies by hosted model.
        rounding: { probabilityDecimals: 2 },
        usage: {
          inputTokens: body.usage.input_tokens,
          outputTokens: body.usage.output_tokens,
        },
        warnings: [],
        providerMetadata: {
          [provider]: {
            ...(body.usage.cost === undefined
              ? {}
              : { usage: { cost: body.usage.cost } }),
            confidence: Object.fromEntries(
              Object.entries(body.answers).flatMap(([id, answer]) =>
                answer.type === "choice" && answer.confidence !== undefined
                  ? [[id, answer.confidence]]
                  : [],
              ),
            ),
          },
        },
        response: { id: body.id, modelId: body.model },
      };
    },
  };
}

function toSystemOneQuestion(question: Experimental_DecisionModelV4Question) {
  return question.type === "boolean" ? { ...question, type: "noul" } : question;
}

function fromSystemOneAnswer(
  answer: z.infer<typeof systemOneResponseSchema>["answers"][string],
): Experimental_DecisionModelV4Answer {
  if (answer.type === "noul") {
    return { type: "boolean", probability: answer.noul };
  }
  return {
    type: "choice",
    choice: answer.choice,
    probabilities: answer.probabilities,
  };
}
