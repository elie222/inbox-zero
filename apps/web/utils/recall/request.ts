import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("recall/request");

export type RecallRequestOptions = RequestInit & {
  params?: Record<string, string | number | boolean | undefined>;
};

export async function recallRequest<T>(
  endpoint: string,
  options: RecallRequestOptions = {},
): Promise<T> {
  if (!env.RECALL_API_KEY) {
    throw new Error("RECALL_API_KEY environment variable is required");
  }

  const base = env.RECALL_API_BASE_URL;
  const urlObj = new URL(`${base}${endpoint}`);
  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      if (value !== undefined && value !== null) {
        urlObj.searchParams.set(key, String(value));
      }
    }
  }
  const url = urlObj.toString();

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Token ${env.RECALL_API_KEY}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Recall API request failed", {
      url,
      status: response.status,
      statusText: response.statusText,
      error: errorText,
    });
    throw new Error(
      `Recall API error: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}
