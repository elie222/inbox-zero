import type { AnalyzeSenderPatternBody } from "@/app/api/ai/analyze-sender-pattern/route";
import {
  INTERNAL_API_KEY_HEADER,
  getInternalApiUrl,
} from "@/utils/internal-api";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("sender-pattern-analysis");

export async function analyzeSenderPattern(body: AnalyzeSenderPatternBody) {
  try {
    const response = await fetch(
      `${getInternalApiUrl()}/api/ai/analyze-sender-pattern`,
      {
        method: "POST",
        body: JSON.stringify(body),
        headers: {
          "Content-Type": "application/json",
          [INTERNAL_API_KEY_HEADER]: env.INTERNAL_API_KEY,
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
  } catch (error) {
    logger.error("Error in sender pattern analysis", {
      emailAccountId: body.emailAccountId,
      from: body.from,
      error,
    });
  }
}
