import type { Logger } from "@/utils/logger";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import { bulkArchiveSenderJobSchema } from "@/utils/actions/mail-bulk-action.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { GmailProvider } from "@/utils/email/google";
import { SafeError } from "@/utils/error";

export const MAIL_BULK_ARCHIVE_TOPIC = "mail-bulk-archive";
export const MAIL_BULK_ARCHIVE_QUEUE_NAME = "mail-bulk-archive";
export const MAIL_BULK_ARCHIVE_PATH = "/api/mail/bulk-archive";

export async function enqueueBulkArchiveSenderJobs({
  emailAccountId,
  ownerEmail,
  froms,
  logger,
}: {
  emailAccountId: string;
  ownerEmail: string;
  froms: string[];
  logger: Logger;
}) {
  const senders = getUniqueSenders(froms);

  await Promise.all(
    senders.map((sender) =>
      enqueueBackgroundJob({
        topic: MAIL_BULK_ARCHIVE_TOPIC,
        body: bulkArchiveSenderJobSchema.parse({
          emailAccountId,
          ownerEmail,
          provider: "google",
          sender,
        }),
        qstash: {
          queueName: MAIL_BULK_ARCHIVE_QUEUE_NAME,
          parallelism: 1,
          path: MAIL_BULK_ARCHIVE_PATH,
        },
        logger,
      }),
    ),
  );

  return senders.length;
}

export async function executeBulkArchiveSenderJob({
  emailAccountId,
  ownerEmail,
  provider,
  sender,
  logger,
}: {
  emailAccountId: string;
  ownerEmail: string;
  provider: string;
  sender: string;
  logger: Logger;
}) {
  if (!isGoogleProvider(provider)) {
    throw new SafeError("Bulk archive queue only supports Google accounts");
  }

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  if (!(emailProvider instanceof GmailProvider)) {
    throw new SafeError("Failed to initialize Gmail provider for bulk archive");
  }

  await emailProvider.bulkArchiveSenderOrThrow(
    sender,
    ownerEmail,
    emailAccountId,
  );
}

function getUniqueSenders(froms: string[]) {
  return Array.from(new Set(froms.map((from) => from.trim()).filter(Boolean)));
}
