import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { unsubscribeSenderBody } from "@/utils/actions/unsubscriber.validation";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";

export type UnsubscribeSenderResponse = Awaited<
  ReturnType<typeof unsubscribeSenderAndMark>
>;

/**
 * REST equivalent of `unsubscribeSenderAction`. Attempts an RFC 8058 one-click
 * unsubscribe server-side so the caller doesn't have to open a browser, and
 * marks the sender `UNSUBSCRIBED` only if that succeeds.
 *
 * Check `unsubscribe.success` in the response: when it is false the sender was
 * left unchanged and the caller should fall back to opening `unsubscribeLink`.
 */
export const POST = withEmailAccount(
  "user/senders/unsubscribe",
  async (request) => {
    const { senderEmail, unsubscribeLink, listUnsubscribeHeader } =
      unsubscribeSenderBody.parse(await request.json());

    const result = await unsubscribeSenderAndMark({
      emailAccountId: request.auth.emailAccountId,
      senderEmail,
      unsubscribeLink,
      listUnsubscribeHeader,
      logger: request.logger,
    });

    return NextResponse.json(result satisfies UnsubscribeSenderResponse);
  },
);
