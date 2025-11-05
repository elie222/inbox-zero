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
const PRIVACY_MODE =
  process.env.PRIVACY_MODE === "true" ||
  process.env.NEXT_PUBLIC_PRIVACY_MODE === "true";

export const publishAiCall =
  tb && !PRIVACY_MODE
    ? tb.buildIngestEndpoint({
        datasource: "aiCall",
        event: tinybirdAiCall,
      })
    : () => {};
