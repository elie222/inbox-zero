import chunk from "lodash/chunk";
import { deleteQueue, listQueues, publishToQstashQueue } from "@/utils/upstash";
import { getInternalApiUrl } from "@/utils/internal-api";
import type { AiCategorizeSenders } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("upstash");

const CATEGORIZE_SENDERS_PREFIX = "ai-categorize-senders";

const getCategorizeSendersQueueName = ({
  emailAccountId,
}: {
  emailAccountId: string;
}) => `${CATEGORIZE_SENDERS_PREFIX}-${emailAccountId}`;

/**
 * Publishes sender categorization tasks to QStash queue in batches
 * Splits large arrays of senders into chunks of BATCH_SIZE to prevent overwhelming the system
 */
export async function publishToAiCategorizeSendersQueue(
  body: AiCategorizeSenders,
) {
  const url = `${getInternalApiUrl()}/api/user/categorize/senders/batch`;

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
      publishToQstashQueue({
        queueName,
        parallelism: 3, // Allow up to 3 concurrent jobs from this queue
        url,
        body: {
          emailAccountId: body.emailAccountId,
          senders: senderChunk,
        } satisfies AiCategorizeSenders,
      }),
    ),
  );
}

export async function deleteEmptyCategorizeSendersQueues({
  skipEmailAccountId,
}: {
  skipEmailAccountId: string;
}) {
  return deleteEmptyQueues({
    prefix: CATEGORIZE_SENDERS_PREFIX,
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
