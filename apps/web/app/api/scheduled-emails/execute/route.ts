import { z } from "zod";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { withQstashOrInternal } from "@/utils/qstash";
import { releaseHeldEmail } from "@/utils/scheduled-email/service";

export const maxDuration = 300;

const bodySchema = z.object({ scheduledEmailId: z.string().min(1) });

export const POST = withError(
  "scheduled-emails/execute",
  withQstashOrInternal(async (request) => {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response("Invalid payload structure", { status: 400 });
    }
    const row = await prisma.scheduledEmail.findUnique({
      where: { id: parsed.data.scheduledEmailId },
    });
    if (!row) return new Response("Scheduled email not found", { status: 404 });

    const current = await releaseHeldEmail(
      row,
      request.logger.with({
        emailAccountId: row.emailAccountId,
        scheduledEmailId: row.id,
      }),
    );
    return new Response(current.status, { status: 200 });
  }),
);
