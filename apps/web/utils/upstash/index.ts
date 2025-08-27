import { Client, type FlowControl, type HeadersInit } from "@upstash/qstash";
import { env } from "@/env";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import { sleep } from "@/utils/sleep";
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
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}${path}`;

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

async function fallbackPublishToQstash<T>(url: string, body: T) {
  // Fallback to fetch if Qstash client is not found
  logger.warn("Qstash client not found");

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
