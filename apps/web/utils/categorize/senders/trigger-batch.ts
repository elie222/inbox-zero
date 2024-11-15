import { z } from "zod";
import { env } from "@/env";
import { getQstashClient } from "@/utils/upstash";
import { sleep } from "@/utils/sleep";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import { SafeError } from "@/utils/error";

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

  if (client) return await client.publishJSON({ url, body });

  // Fallback to fetch if Qstash client is not found
  console.warn("Qstash client not found");

  if (!env.INTERNAL_API_KEY)
    throw new SafeError("Internal API key must be set");

  // Don't await. Run in background
  fetch(`${url}/simple`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [INTERNAL_API_KEY_HEADER]: env.INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  });
  // Wait for 100ms to ensure the request is sent
  await sleep(100);
}
