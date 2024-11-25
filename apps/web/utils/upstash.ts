import { Client } from "@upstash/qstash";
import { env } from "@/env";
import { INTERNAL_API_KEY_HEADER } from "@/utils/internal-api";
import { SafeError } from "@/utils/error";
import { sleep } from "@/utils/sleep";
import type { AiCategorizeSenders } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

export async function publishToQstash(url: string, body: any) {
  const client = getQstashClient();

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

export async function publishToAiCategorizeSendersQueue(
  body: AiCategorizeSenders,
) {
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/user/categorize/senders/batch`;

  await publishToQstashQueue({
    queueName: "ai-categorize-senders",
    parallelism: 3,
    url,
    body,
  });
}
