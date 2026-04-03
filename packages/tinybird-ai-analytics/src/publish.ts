import { z } from "zod";
import { getTinybird } from "./client";

const tinybirdAiCall = z.object({
  userId: z.string(),
  emailAccountId: z.string(),
  timestamp: z.number(), // date
  totalTokens: z.number().int(),
  completionTokens: z.number().int(),
  promptTokens: z.number().int(),
  cachedInputTokens: z.number().int(),
  reasoningTokens: z.number().int(),
  cost: z.number(),
  estimatedCost: z.number(),
  providerReportedCost: z.number().optional(),
  providerUpstreamInferenceCost: z.number().optional(),
  providerCostSource: z.string().optional(),
  isUserApiKey: z.number().int(),
  model: z.string(),
  provider: z.string(),
  label: z.string().optional(),
  stepCount: z.number().int().optional(),
  toolCallCount: z.number().int().optional(),
  data: z.string().optional(),
});
export type TinybirdAiCall = z.infer<typeof tinybirdAiCall>;

const tb = getTinybird();

export const publishAiCall = tb
  ? tb.buildIngestEndpoint({
      datasource: "aiCall",
      event: tinybirdAiCall,
    })
  : () => {};
