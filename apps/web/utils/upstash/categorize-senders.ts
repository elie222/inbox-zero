import chunk from "lodash/chunk";
import { deleteQueue, listQueues } from "@/utils/upstash";
import { enqueueJob } from "@/utils/queue/queue-manager";
import { AI_CATEGORIZE_SENDERS_QUEUE_COUNT } from "@/utils/queue/queues";
import { env } from "@/env";
import type { AiCategorizeSenders } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("upstash");

// Use the same prefix as defined in queues.ts for consistency
const AI_CATEGORIZE_SENDERS_PREFIX = "ai-categorize-senders";

/**
 * Distributes email accounts across multiple queues for load balancing
 *
 * For Redis: Uses a simple hash of the emailAccountId to ensure consistent distribution
 * - Creates hash by summing character codes
 * - Example: "user-123" -> 'u'(117) + 's'(115) + 'e'(101) + 'r'(114) + '-'(45) + '1'(49) + '2'(50) + '3'(51) = 742
 * - Distributes across 7 queues (0-6) using modulo: 742 % 7 = 0 -> "ai-categorize-senders-0"
 *
 * For QStash: Uses per-email-account queues for maximum parallelization
 */
const getCategorizeSendersQueueName = ({
  emailAccountId,
}: {
  emailAccountId: string;
}) => {
  if (env.QUEUE_SYSTEM === "redis") {
    const characterCodeSum = emailAccountId
      .split("")
      .reduce((total, character) => total + character.charCodeAt(0), 0);

    const targetQueueIndex =
      characterCodeSum % AI_CATEGORIZE_SENDERS_QUEUE_COUNT;

    return `${AI_CATEGORIZE_SENDERS_PREFIX}-${targetQueueIndex}`;
  }

  return `${AI_CATEGORIZE_SENDERS_PREFIX}-${emailAccountId}`;
};

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
  const chunks = chunk(body.senders, BATCH_SIZE);

  // Create new queue for each user so we can run multiple users in parallel
  const queueName = getCategorizeSendersQueueName({
    emailAccountId: body.emailAccountId,
  });

  logger.info("Publishing to AI categorize senders queue in chunks", {
    url,
    queueName,
    totalSenders: body.senders.length,
    numberOfChunks: chunks.length,
  });

  // Process all chunks in parallel, each as a separate queue item
  await Promise.all(
    chunks.map((senderChunk) =>
      enqueueJob(queueName, {
        emailAccountId: body.emailAccountId,
        senders: senderChunk,
      } satisfies AiCategorizeSenders),
    ),
  );
}

export async function deleteEmptyCategorizeSendersQueues({
  skipEmailAccountId,
}: {
  skipEmailAccountId: string;
}) {
  return deleteEmptyQueues({
    prefix: AI_CATEGORIZE_SENDERS_PREFIX,
    skipEmailAccountId,
  });
}

async function deleteEmptyQueues({
  prefix,
  skipEmailAccountId,
}: {
  prefix: string;
  skipEmailAccountId: string;
}) {
  const queues = await listQueues();
  logger.info("Found queues", { count: queues.length });
  for (const queue of queues) {
    if (!queue.name.startsWith(prefix)) continue;
    if (
      skipEmailAccountId &&
      queue.name ===
        getCategorizeSendersQueueName({ emailAccountId: skipEmailAccountId })
    )
      continue;

    if (!queue.lag) {
      try {
        await deleteQueue(queue.name);
      } catch (error) {
        logger.error("Error deleting queue", { queueName: queue.name, error });
      }
    }
  }
}
