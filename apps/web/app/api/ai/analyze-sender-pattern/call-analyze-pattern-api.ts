import type { AnalyzeSenderPatternBody } from "@/app/api/ai/analyze-sender-pattern/route";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("sender-pattern-analysis");

export async function analyzeSenderPattern(body: AnalyzeSenderPatternBody) {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_BASE_URL}/api/ai/analyze-sender-pattern`,
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
        userId: body.userId,
        from: body.from,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (error) {
    logger.error("Error in sender pattern analysis", {
      userId: body.userId,
      from: body.from,
      error: error instanceof Error ? error.message : error,
    });
  }
} 