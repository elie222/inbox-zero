import { NextResponse } from "next/server";
import { digestBody } from "./validation";
import prisma from "@/utils/prisma";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { withQstashOrInternal } from "@/utils/qstash";
import {
  releaseDigestSummarySlot,
  reserveDigestSummarySlot,
} from "@/utils/digest/summary-limit";
import { checkHasAccess } from "@/utils/premium/server";
import { upsertDigest } from "@/app/api/ai/digest/upsert-digest";

export const POST = withError(
  "digest",
  withQstashOrInternal(async (request) => {
    let logger = request.logger;

    try {
      const body = digestBody.parse(await request.json());
      const { emailAccountId, actionId, message } = body;

      logger = logger.with({ emailAccountId, messageId: message.id });

      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) {
        throw new Error("Email account not found");
      }

      const hasDigestAccess = await checkHasAccess({
        userId: emailAccount.userId,
        minimumTier: "PLUS_MONTHLY",
      });
      if (!hasDigestAccess) {
        logger.info("Skipping digest item because plan does not include it");
        return new NextResponse("OK", { status: 200 });
      }

      // Don't summarize Digest emails (this will actually block all emails that we send, but that's okay)
      if (message.from === env.RESEND_FROM_EMAIL) {
        logger.info("Skipping digest item because it is from us");
        return new NextResponse("OK", { status: 200 });
      }

      const ruleName = actionId
        ? await getRuleNameByExecutedAction(actionId)
        : null;

      if (!ruleName) {
        logger.warn("Rule name not found for executed action", { actionId });
        return new NextResponse("OK", { status: 200 });
      }

      const summaryReservation = await reserveDigestSummarySlot({
        emailAccountId,
        maxSummariesPer24h: env.DIGEST_MAX_SUMMARIES_PER_24H,
      });
      if (!summaryReservation.reserved) {
        logger.info("Skipping digest item because summary limit was reached", {
          maxSummariesPer24h: env.DIGEST_MAX_SUMMARIES_PER_24H,
        });
        return new NextResponse("OK", { status: 200 });
      }

      let shouldReleaseSummaryReservation = !!summaryReservation.reservationId;

      try {
        const summary = await aiSummarizeEmailForDigest({
          ruleName,
          emailAccount,
          messageToSummarize: {
            ...message,
            to: message.to || "",
          },
        });

        if (!summary?.content) {
          logger.info(
            "Skipping digest item because it is not worth summarizing",
          );
          return new NextResponse("OK", { status: 200 });
        }

        await upsertDigest({
          messageId: message.id || "",
          threadId: message.threadId || "",
          emailAccountId,
          actionId,
          content: summary,
          logger,
        });

        // Keep Prisma fallback reservations releasable on success to avoid
        // counting a placeholder row in addition to the persisted digest item.
        shouldReleaseSummaryReservation =
          summaryReservation.reservationSource === "prisma";

        return new NextResponse("OK", { status: 200 });
      } finally {
        if (
          summaryReservation.reservationId &&
          shouldReleaseSummaryReservation
        ) {
          await releaseDigestSummarySlot({
            emailAccountId,
            reservationId: summaryReservation.reservationId,
            reservationSource: summaryReservation.reservationSource,
          }).catch((error) => {
            logger.error("Failed to release digest summary reservation", {
              error,
            });
          });
        }
      }
    } catch (error) {
      logger.error("Failed to process digest", { error });
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }),
);

async function getRuleNameByExecutedAction(
  actionId: string,
): Promise<string | undefined> {
  const executedAction = await prisma.executedAction.findUnique({
    where: { id: actionId },
    select: {
      executedRule: {
        select: {
          rule: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!executedAction) {
    throw new Error("Executed action not found");
  }

  return executedAction.executedRule?.rule?.name;
}
