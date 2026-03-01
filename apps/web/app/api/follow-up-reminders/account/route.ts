import { after, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/env";
import { hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";
import { withError } from "@/utils/middleware";
import { processFollowUpRemindersForEmailAccountId } from "../process";

const bodySchema = z.object({
  emailAccountId: z.string().min(1),
});

export const POST = withError(
  "follow-up-reminders/account",
  async (request) => {
    if (!(await hasPostCronSecret(request))) {
      captureException(
        new Error("Unauthorized cron request: api/follow-up-reminders/account"),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    if (!env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED) {
      request.logger.warn("Follow-up reminders feature is disabled");
      return NextResponse.json({ message: "Follow-up reminders disabled" });
    }

    const parseResult = bodySchema.safeParse(await request.json());
    if (!parseResult.success) {
      request.logger.error("Invalid follow-up reminder account payload", {
        errors: parseResult.error.errors,
      });
      return NextResponse.json(
        { error: "Invalid payload", details: parseResult.error.errors },
        { status: 400 },
      );
    }

    const { emailAccountId } = parseResult.data;
    const logger = request.logger.with({ emailAccountId });

    after(() =>
      runWithBackgroundLoggerFlush({
        logger,
        task: async () => {
          const startTime = Date.now();
          const result = await processFollowUpRemindersForEmailAccountId({
            emailAccountId,
            logger,
          });

          logger.info("Finished follow-up reminder account task", {
            result,
            processingTimeMs: Date.now() - startTime,
          });
        },
        extra: { url: "/api/follow-up-reminders/account" },
      }),
    );

    return NextResponse.json({ processing: true });
  },
);
