import { Client, type FlowControl, type HeadersInit } from "@upstash/qstash";
import { env } from "@/env";
import {
  INTERNAL_API_KEY_HEADER,
  getInternalApiUrl,
} from "@/utils/internal-api";
import { acquireRateLimitToken } from "@/utils/redis/rate-limit";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("upstash");

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

export async function publishToQstash<T>(
  path: string,
  body: T,
  flowControl?: FlowControl,
) {
  const client = getQstashClient();
  const url = `${getInternalApiUrl()}${path}`;

  if (client) {
    return client.publishJSON({
      url,
      body,
      flowControl,
      retries: 3,
      headers: {
        "Retry-After": "10", // 10 seconds
      },
    });
  }

  return fallbackPublishToQstash(url, body);
}

export async function bulkPublishToQstash<T>({
  items,
}: {
  items: {
    url: string;
    body: T;
    flowControl?: FlowControl;
  }[];
}) {
  const client = getQstashClient();
  if (client) {
    return client.batchJSON(items);
  }

  for (const item of items) {
    await fallbackPublishToQstash(item.url, item.body);
  }
}

export async function publishToQstashQueue<T>({
  queueName,
  parallelism,
  url,
  body,
  headers,
}: {
  queueName: string;
  parallelism: number;
  url: string;
  body: T;
  headers?: HeadersInit;
}) {
  const client = getQstashClient();

  if (client) {
    const queue = client.queue({ queueName });
    queue.upsert({ parallelism });
    return await queue.enqueueJSON({ url, body, headers });
  }

  return fallbackPublishToQstash<T>(url, body);
}

/**
 * Fallback HTTP publisher for when QStash is unavailable.
 *
 * Applies rate limiting using emailAccountId from the body to prevent
 * overwhelming downstream services. Uses fire-and-forget pattern with
 * error logging.
 *
 * @param url - Target URL (will have `/simple` appended)
 * @param body - Request body, optionally containing emailAccountId for rate limiting
 */
async function fallbackPublishToQstash<T>(url: string, body: T) {
  logger.warn("Qstash client not found, using fallback");

  // Rate limit at the source to prevent overwhelming downstream services.
  // Extract emailAccountId from body if available, otherwise use global key.
  // Note: Use || instead of ?? to handle empty strings as falsy
  const rateLimitKey =
    (body as { emailAccountId?: string }).emailAccountId || "global";
  await acquireRateLimitToken(rateLimitKey);

  // Fire-and-forget with error logging
  fetch(`${url}/simple`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [INTERNAL_API_KEY_HEADER]: env.INTERNAL_API_KEY,
    },
    body: JSON.stringify(body),
  }).catch((error) => {
    logger.error("Fallback fetch failed", {
      url: `${url}/simple`,
      error: error instanceof Error ? error.message : String(error),
      rateLimitKey,
    });
  });
}

export async function listQueues() {
  const client = getQstashClient();
  if (client) {
    return await client.queue().list();
  }
  return [];
}

export async function deleteQueue(queueName: string) {
  const client = getQstashClient();
  if (client) {
    logger.info("Deleting queue", { queueName });
    await client.queue({ queueName }).delete();
  }
}
