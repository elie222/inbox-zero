import { withError, type RequestWithLogger } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { bulkArchiveSenderJobSchema } from "@/utils/actions/mail-bulk-action.validation";
import { executeBulkArchiveSenderJob } from "@/utils/email/bulk-archive-queue";

export const maxDuration = 300;

export const POST = withError(
  "mail/bulk-archive",
  withQstashOrInternal(async (request: RequestWithLogger) => {
    const body = bulkArchiveSenderJobSchema.parse(await request.json());

    await executeBulkArchiveSenderJob({
      ...body,
      logger: request.logger,
    });

    return Response.json({ success: true });
  }),
);
