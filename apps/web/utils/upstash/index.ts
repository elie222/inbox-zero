import { Client, type FlowControl, type HeadersInit } from "@upstash/qstash";
import { after } from "next/server";
import { env } from "@/env";
import {
  INTERNAL_API_KEY_HEADER,
  getInternalApiUrl,
} from "@/utils/internal-api";
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
    try {
      const queue = client.queue({ queueName });
      await queue.upsert({ parallelism });
      return await queue.enqueueJSON({ url, body, headers });
    } catch (error) {
      logger.error("Failed to publish to Qstash queue", {
        url,
        queueName,
        error,
      });
      throw error;
    }
  }

  return fallbackPublishToQstash<T>(url, body, headers);
}

async function fallbackPublishToQstash<T>(
  url: string,
  body: T,
  headers?: HeadersInit,
) {
  // Fallback to fetch if Qstash client is not found
  logger.warn("Qstash client not found");

  const internalHeaders = new Headers(
    headers instanceof Headers
      ? headers
      : Array.isArray(headers)
        ? headers
        : headers && typeof headers === "object" && Symbol.iterator in headers
          ? Array.from(headers as Iterable<[string, string]>)
          : headers,
  );
  internalHeaders.set("Content-Type", "application/json");
  internalHeaders.set(INTERNAL_API_KEY_HEADER, env.INTERNAL_API_KEY);

  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify(body),
      });
    } catch (error) {
      logger.error("Fallback QStash fetch failed", { url, error });
    }
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
