import { z } from "zod";
import { getInternalApiHeaders, getInternalApiUrl } from "@/utils/internal-api";
import type { Logger } from "@/utils/logger";

export const analyzeSenderPatternBodySchema = z.object({
  emailAccountId: z.string(),
  from: z.string(),
  // Re-analyze even when the sender was checked before (manual learning)
  force: z.boolean().optional(),
});
export type AnalyzeSenderPatternBody = z.infer<
  typeof analyzeSenderPatternBodySchema
>;

export async function analyzeSenderPattern(
  body: AnalyzeSenderPatternBody,
  logger: Logger,
): Promise<{ ok: boolean; status?: number }> {
  try {
    const response = await fetch(
      `${getInternalApiUrl()}/api/ai/analyze-sender-pattern`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          ...getInternalApiHeaders(),
        },
      },
    );

    if (!response.ok) {
      logger.error("Sender pattern analysis API request failed", {
        emailAccountId: body.emailAccountId,
        from: body.from,
        status: response.status,
        statusText: response.statusText,
      });
    }
    return { ok: response.ok, status: response.status };
  } catch (error) {
    logger.error("Error in sender pattern analysis", {
      emailAccountId: body.emailAccountId,
      from: body.from,
      error,
    });
    return { ok: false };
  }
}
