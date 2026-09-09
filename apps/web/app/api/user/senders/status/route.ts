import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { setSenderStatusBody } from "@/utils/actions/unsubscriber.validation";
import { setSenderStatusWithAutoArchive } from "@/utils/senders/unsubscribe";

export type SetSenderStatusResponse = Awaited<
  ReturnType<typeof setSenderStatusWithAutoArchive>
>;

/**
 * REST equivalent of `setSenderStatusAction` for clients that cannot call
 * server actions. Takes the same body and shares its implementation.
 *
 * Existing mail from the sender is left alone; archiving the backlog is a
 * separate bulk operation.
 */
export const POST = withEmailProvider(
  "user/senders/status",
  async (request) => {
    const { senderEmail, status, labelId, labelName } =
      setSenderStatusBody.parse(await request.json());

    const result = await setSenderStatusWithAutoArchive({
      emailAccountId: request.auth.emailAccountId,
      emailProvider: request.emailProvider,
      senderEmail,
      status,
      labelId,
      labelName,
    });

    return NextResponse.json(result satisfies SetSenderStatusResponse);
  },
);
