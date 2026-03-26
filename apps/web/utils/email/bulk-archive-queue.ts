import type { Logger } from "@/utils/logger";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import { bulkArchiveSenderJobSchema } from "@/utils/actions/mail-bulk-action.validation";
import { createEmailProvider } from "@/utils/email/provider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { GmailProvider } from "@/utils/email/google";
import { OutlookProvider } from "@/utils/email/microsoft";
import { SafeError } from "@/utils/error";

export const MAIL_BULK_ARCHIVE_TOPIC = "mail-bulk-archive";
export const MAIL_BULK_ARCHIVE_QUEUE_NAME = "mail-bulk-archive";
export const MAIL_BULK_ARCHIVE_PATH = "/api/mail/bulk-archive";

export async function enqueueBulkArchiveSenderJobs({
  emailAccountId,
  ownerEmail,
  provider,
  froms,
  logger,
}: {
  emailAccountId: string;
  ownerEmail: string;
  provider: "google" | "microsoft";
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
          provider,
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
  provider: "google" | "microsoft";
  sender: string;
  logger: Logger;
}) {
  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger,
  });

  if (isGoogleProvider(provider)) {
    if (!(emailProvider instanceof GmailProvider)) {
      throw new SafeError(
        "Failed to initialize Gmail provider for bulk archive",
      );
    }

    await emailProvider.bulkArchiveSenderOrThrow(
      sender,
      ownerEmail,
      emailAccountId,
    );

    return;
  }

  if (!(emailProvider instanceof OutlookProvider)) {
    throw new SafeError(
      "Failed to initialize Outlook provider for bulk archive",
    );
  }

  await emailProvider.bulkArchiveSenderOrThrow(
    sender,
    ownerEmail,
    emailAccountId,
  );
}

function getUniqueSenders(froms: string[]) {
  const uniqueSenders = new Map<string, string>();

  for (const from of froms) {
    const normalizedSender = normalizeSender(from);
    if (!normalizedSender || uniqueSenders.has(normalizedSender)) continue;

    uniqueSenders.set(normalizedSender, from.trim());
  }

  return Array.from(uniqueSenders.values());
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}
