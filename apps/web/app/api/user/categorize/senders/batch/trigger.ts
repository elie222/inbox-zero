import { z } from "zod";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import { env } from "@/env";

export const categorizeSendersBatchSchema = z.object({
  userId: z.string(),
  pageToken: z.string().optional(),
  pageIndex: z.number().default(0),
});
type CategorizeSendersBatchBody = z.infer<typeof categorizeSendersBatchSchema>;

export async function triggerCategorizeBatch(body: CategorizeSendersBatchBody) {
  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/user/categorize/senders/batch`;

  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [INTERNAL_API_KEY_HEADER]: env.INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  });
}
