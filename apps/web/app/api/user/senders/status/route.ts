import { NextResponse } from "next/server";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { withEmailProvider } from "@/utils/middleware";
import { setSenderStatusRequestBody } from "@/utils/actions/unsubscriber.validation";
import {
  consumeUnsubscribeCredit,
  userHasUnsubscribeAccess,
} from "@/utils/premium/unsubscribe-credits";
import { archiveExistingSenderMail } from "@/utils/senders/archive-existing";
import { unsubscribeAllowanceErrorResponse } from "@/utils/senders/unsubscribe-allowance";
import { setSenderStatusWithAutoArchive } from "@/utils/senders/unsubscribe";

export type SetSenderStatusResponse = Awaited<
  ReturnType<typeof setSenderStatusWithAutoArchive>
> & {
  archiveExisting?: "completed" | "queued";
};

/**
 * REST equivalent of `setSenderStatusAction` for clients that cannot call
 * server actions. Takes the same body and shares its implementation.
 *
 * Existing mail is left alone unless `archiveExisting` is true. That flag is
 * only valid with `AUTO_ARCHIVED`. Large backlogs are archived after the
 * response (`archiveExisting: "queued"`).
 *
 * `AUTO_ARCHIVED` requires unsubscribe allowance and spends one free-tier
 * credit. Approve and clear do not.
 */
export const maxDuration = 180;

export const POST = withEmailProvider(
  "user/senders/status",
  async (request) => {
    const { senderEmail, status, labelId, labelName, archiveExisting } =
      setSenderStatusRequestBody.parse(await request.json());

    if (archiveExisting && status !== NewsletterStatus.AUTO_ARCHIVED) {
      return NextResponse.json(
        {
          error: "archiveExisting requires AUTO_ARCHIVED status",
          isKnownError: true,
        },
        { status: 400 },
      );
    }

    const { userId } = request.auth;
    if (
      status === NewsletterStatus.AUTO_ARCHIVED &&
      !(await userHasUnsubscribeAccess({ userId }))
    ) {
      return unsubscribeAllowanceErrorResponse();
    }

    const result = await setSenderStatusWithAutoArchive({
      emailAccountId: request.auth.emailAccountId,
      emailProvider: request.emailProvider,
      senderEmail,
      status,
      labelId,
      labelName,
    });

    const archiveExistingResult = archiveExisting
      ? await archiveExistingSenderMail({
          emailAccountId: request.auth.emailAccountId,
          emailProvider: request.emailProvider,
          senderEmail: result.senderEmail,
          ownerEmail: request.auth.email,
          logger: request.logger,
        })
      : undefined;

    if (status === NewsletterStatus.AUTO_ARCHIVED) {
      try {
        await consumeUnsubscribeCredit({ userId });
      } catch (error) {
        request.logger.error("Failed to consume unsubscribe credit", {
          error,
        });
      }
    }

    return NextResponse.json({
      ...result,
      ...(archiveExistingResult
        ? { archiveExisting: archiveExistingResult }
        : {}),
    } satisfies SetSenderStatusResponse);
  },
);
