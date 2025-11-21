import { publishToQstashQueue } from "@/utils/upstash";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("upstash/bulk-operations");

const BULK_OPERATIONS_PREFIX = "bulk-operations";

const getBulkOperationQueueName = ({
  emailAccountId,
  operationType,
}: {
  emailAccountId: string;
  operationType: "archive" | "mark-read";
}) => `${BULK_OPERATIONS_PREFIX}-${operationType}-${emailAccountId}`;

/**
 * Publishes an archive category operation to the queue
 */
export async function publishArchiveCategoryQueue({
  emailAccountId,
  operationId,
  category,
  senders,
}: {
  emailAccountId: string;
  operationId: string;
  category: string;
  senders: string[];
}) {
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/webhooks/deep-clean/archive`;

  const queueName = getBulkOperationQueueName({
    emailAccountId,
    operationType: "archive",
  });

  logger.info("Publishing archive category operation", {
    emailAccountId,
    operationId,
    category,
    senderCount: senders.length,
    queueName,
  });

  await publishToQstashQueue({
    queueName,
    parallelism: 1, // Process one category at a time per user
    url,
    body: {
      emailAccountId,
      operationId,
      category,
      senders,
    },
  });
}

/**
 * Publishes a mark-as-read category operation to the queue
 */
export async function publishMarkAsReadCategoryQueue({
  emailAccountId,
  operationId,
  category,
  senders,
}: {
  emailAccountId: string;
  operationId: string;
  category: string;
  senders: string[];
}) {
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/webhooks/deep-clean/mark-read`;

  const queueName = getBulkOperationQueueName({
    emailAccountId,
    operationType: "mark-read",
  });

  logger.info("Publishing mark-as-read category operation", {
    emailAccountId,
    operationId,
    category,
    senderCount: senders.length,
    queueName,
  });

  await publishToQstashQueue({
    queueName,
    parallelism: 1, // Process one category at a time per user
    url,
    body: {
      emailAccountId,
      operationId,
      category,
      senders,
    },
  });
}
