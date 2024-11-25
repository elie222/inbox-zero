import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import { SafeError } from "@/utils/error";
import { sleep } from "@/utils/sleep";
import type { AiCategorizeSenders } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("upstash");

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

export async function publishToQstash(url: string, body: any) {
  const client = getQstashClient();

  if (client) return await client.publishJSON({ url, body });

  // Fallback to fetch if Qstash client is not found
  logger.warn("Qstash client not found");

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

export async function publishToQstashQueue({
  queueName,
  parallelism,
  url,
  body,
}: {
  queueName: string;
  parallelism: number;
  url: string;
  body: any;
}) {
  const client = getQstashClient();

  if (client) {
    const queue = client.queue({ queueName });
    queue.upsert({ parallelism });
    return await queue.enqueueJSON({ url, body });
  }

  // Fallback to fetch if Qstash client is not found
  logger.warn("Qstash client not found");

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

/**
 * Publishes sender categorization tasks to QStash queue in batches
 * Splits large arrays of senders into chunks of BATCH_SIZE to prevent overwhelming the system
 */
export async function publishToAiCategorizeSendersQueue(
  body: AiCategorizeSenders,
) {
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/user/categorize/senders/batch`;

  // Split senders into smaller chunks to process in batches
  const BATCH_SIZE = 50;
  const chunks = chunkArray(body.senders, BATCH_SIZE);

  logger.trace("Publishing to AI categorize senders queue in chunks", {
    url,
    totalSenders: body.senders.length,
    numberOfChunks: chunks.length,
  });

  // Process all chunks in parallel, each as a separate queue item
  await Promise.all(
    chunks.map((senderChunk) =>
      publishToQstashQueue({
        queueName: "ai-categorize-senders",
        parallelism: 3, // Allow up to 3 concurrent jobs from this queue
        url,
        body: {
          userId: body.userId,
          senders: senderChunk,
        },
      }),
    ),
  );
}

/**
 * Utility function to split an array into smaller chunks of specified size
 * @param array The array to split into chunks
 * @param size Maximum size of each chunk
 * @returns Array of chunks
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
    array.slice(index * size, (index + 1) * size),
  );
}
