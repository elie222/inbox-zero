import { z } from "zod";
import { getTinybird } from "./client";

const tinybirdAiCall = z.object({
  userId: z.string(),
  timestamp: z.number(), // date
  totalTokens: z.number().int(),
  completionTokens: z.number().int(),
  promptTokens: z.number().int(),
  cost: z.number(),
  model: z.string(),
  provider: z.string(),
  label: z.string().optional(),
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
