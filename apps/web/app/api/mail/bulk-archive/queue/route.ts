import { createForwardingQueueHandler } from "@/utils/queue/create-forwarding-queue-handler";
import { bulkArchiveSenderJobSchema } from "@/utils/actions/mail-bulk-action.validation";
import { MAIL_BULK_ARCHIVE_PATH } from "@/utils/email/bulk-archive-queue";

export const maxDuration = 300;

export const POST = createForwardingQueueHandler({
  loggerScope: "mail/bulk-archive/queue",
  schema: bulkArchiveSenderJobSchema,
  path: MAIL_BULK_ARCHIVE_PATH,
  invalidPayloadMessage: "Invalid bulk archive queue payload",
  visibilityTimeoutSeconds: 295,
  getLoggerContext: (payload) => ({
    emailAccountId: payload.emailAccountId,
  }),
  getTraceContext: (payload) => ({
    sender: payload.sender,
  }),
});
