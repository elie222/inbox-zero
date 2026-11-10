import type { LanguageModelV4 } from "@ai-sdk/provider";
import { APICallError } from "ai";
import { z } from "zod";

const responseSchema = z.object({
  id: z.string(),
  status: z.literal("completed"),
  model: z.string(),
  output: z.array(
    z.object({
      type: z.string(),
      content: z
        .array(z.object({ type: z.string(), text: z.string().optional() }))
        .optional(),
    }),
  ),
  usage: z.object({
    input_tokens: z.number().nonnegative(),
    input_tokens_details: z
      .object({
        cache_read_input_tokens: z.number().nonnegative().optional(),
        cache_creation_input_tokens: z.number().nonnegative().optional(),
        cached_tokens: z.number().nonnegative().optional(),
      })
      .optional(),
    output_tokens: z.number().nonnegative(),
    output_tokens_details: z
      .object({ reasoning_tokens: z.number().nonnegative() })
      .optional(),
    cost: z.object({ total_cost: z.number().nonnegative() }),
  }),
});

// Keep research on the shared LLM path for hardening, DLP, retries and usage.
// https://docs.perplexity.ai/docs/agent-api/migrate-from-sonar/overview
export function createPerplexityResearchModel(apiKey: string): LanguageModelV4 {
  return {
    specificationVersion: "v4",
    provider: "perplexity",
    modelId: "agent-fast",
    supportedUrls: {},
    async doGenerate({ prompt, abortSignal }) {
      const instructions: string[] = [];
      const input = prompt.flatMap((message) => {
        if (message.role === "system") {
          instructions.push(message.content);
          return [];
        }
        if (
          message.role !== "user" ||
          message.content.some((part) => part.type !== "text")
        ) {
          throw new Error(
            "Perplexity research only supports text research queries",
          );
        }
        return [
          {
            type: "message",
            role: "user",
            content: message.content
              .map((part) => (part.type === "text" ? part.text : ""))
              .join("\n"),
          },
        ];
      });
      const url = "https://api.perplexity.ai/v1/agent";
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        // The fast effort preset enables Perplexity's web search by default.
        body: JSON.stringify({
          effort: "fast",
          instructions: instructions.join("\n\n"),
          input,
        }),
        signal: AbortSignal.any([
          AbortSignal.timeout(60_000),
          ...(abortSignal ? [abortSignal] : []),
        ]),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new APICallError({
          message: `Perplexity research request failed (${response.status})`,
          url,
          requestBodyValues: {},
          statusCode: response.status,
          isRetryable: response.status === 429 || response.status >= 500,
        });
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success)
        throw new Error("Invalid Perplexity research response");
      const result = parsed.data;
      const usage = result.usage;
      return {
        content: result.output.flatMap((item) =>
          item.type === "message"
            ? (item.content ?? []).flatMap((part) =>
                part.type === "output_text" && part.text
                  ? [{ type: "text" as const, text: part.text }]
                  : [],
              )
            : [],
        ),
        finishReason: { unified: "stop", raw: result.status },
        usage: {
          inputTokens: {
            total: usage.input_tokens,
            noCache: undefined,
            cacheRead:
              usage.input_tokens_details?.cache_read_input_tokens ??
              usage.input_tokens_details?.cached_tokens,
            cacheWrite: usage.input_tokens_details?.cache_creation_input_tokens,
          },
          outputTokens: {
            total: usage.output_tokens,
            text: undefined,
            reasoning: usage.output_tokens_details?.reasoning_tokens,
          },
        },
        response: { id: result.id, modelId: result.model },
        providerMetadata: {
          perplexity: { cost: usage.cost.total_cost, model: result.model },
        },
        warnings: [],
      };
    },
    async doStream() {
      throw new Error("Perplexity meeting research does not support streaming");
    },
  };
}
