import { z } from "zod";
import { env } from "@/env";
import { getQstashClient } from "@/utils/upstash";

export const categorizeSendersBatchSchema = z.object({
  userId: z.string(),
  pageToken: z.string().optional(),
  pageIndex: z.number(),
});
export type CategorizeSendersBatchBody = z.infer<
  typeof categorizeSendersBatchSchema
>;

export async function triggerCategorizeBatch(body: CategorizeSendersBatchBody) {
  const client = getQstashClient();
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/user/categorize/senders/batch`;
  return await client.publishJSON({ url, body });
}
