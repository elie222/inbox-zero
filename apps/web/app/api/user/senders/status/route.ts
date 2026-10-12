import { NextResponse } from "next/server";
import { NewsletterStatus } from "@/generated/prisma/enums";
import { withEmailProvider } from "@/utils/middleware";
import { setSenderStatusRequestBody } from "@/utils/actions/unsubscriber.validation";
import { readRequestJson } from "@/utils/read-request-json";
import { archiveExistingSenderMail } from "@/utils/senders/archive-existing";
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
 * only valid with `AUTO_ARCHIVED`. Large backlogs, and senders with no local
 * inbox rows, are archived after the response (`archiveExisting: "queued"`).
 * These mail actions do not use AI credits.
 */
export const maxDuration = 180;

export const POST = withEmailProvider(
  "user/senders/status",
  async (request) => {
    const body = await readRequestJson(request);
    if ("response" in body) return body.response;

    const { senderEmail, status, labelId, labelName, archiveExisting } =
      setSenderStatusRequestBody.parse(body.json);

    if (archiveExisting && status !== NewsletterStatus.AUTO_ARCHIVED) {
      return NextResponse.json(
        {
          error: "archiveExisting requires AUTO_ARCHIVED status",
          isKnownError: true,
        },
        { status: 400 },
      );
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

    return NextResponse.json({
      ...result,
      ...(archiveExistingResult
        ? { archiveExisting: archiveExistingResult }
        : {}),
    } satisfies SetSenderStatusResponse);
  },
);
