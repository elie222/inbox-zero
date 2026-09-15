import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import { unsubscribeSenderBody } from "@/utils/actions/unsubscriber.validation";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";

export type UnsubscribeSenderResponse = Awaited<
  ReturnType<typeof unsubscribeSenderAndMark>
>;

export const maxDuration = 180;

/**
 * Tries RFC 8058 one-click POST, then a simple HTML form, then the isolated
 * browser worker when configured. Otherwise uses the existing HTTP GET
 * fallback. Check `unsubscribe.success` in the response: when it is false
 * the sender was left unchanged and the caller should fall back to opening
 * `unsubscribeLink`.
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
