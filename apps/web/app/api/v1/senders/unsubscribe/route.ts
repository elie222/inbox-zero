import { NextResponse } from "next/server";
import { withAccountApiKey } from "@/utils/api-middleware";
import { createEmailProvider } from "@/utils/email/provider";
import {
  createPublicApiMethodNotAllowedHandler,
  readPublicApiJson,
} from "@/utils/public-api-error";
import { getSenderUnsubscribeSource } from "@/utils/senders/source";
import { unsubscribeSenderAndMark } from "@/utils/senders/unsubscribe";
import { unsubscribeSenderRequestSchema } from "./validation";

export const maxDuration = 180;

export const GET = createPublicApiMethodNotAllowedHandler(["POST"]);
export const PUT = createPublicApiMethodNotAllowedHandler(["POST"]);
export const PATCH = createPublicApiMethodNotAllowedHandler(["POST"]);
export const DELETE = createPublicApiMethodNotAllowedHandler(["POST"]);

export const POST = withAccountApiKey(
  "v1/senders/unsubscribe",
  ["SENDERS_UNSUBSCRIBE"],
  async (request) => {
    const { emailAccountId, provider } = request.apiAuth;
    const body = unsubscribeSenderRequestSchema.parse(
      await readPublicApiJson(request),
    );
    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger: request.logger,
    });
    const source =
      body.unsubscribeLink || body.listUnsubscribeHeader
        ? {
            unsubscribeLink: body.unsubscribeLink,
            listUnsubscribeHeader: body.listUnsubscribeHeader,
          }
        : await getSenderUnsubscribeSource({
            senderEmail: body.senderEmail,
            emailProvider,
            logger: request.logger,
          });

    const result = await unsubscribeSenderAndMark({
      emailAccountId,
      senderEmail: body.senderEmail,
      unsubscribeLink: source.unsubscribeLink,
      listUnsubscribeHeader: source.listUnsubscribeHeader,
      logger: request.logger,
    });

    return NextResponse.json(result);
  },
);
