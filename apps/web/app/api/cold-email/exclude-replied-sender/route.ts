import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import { getEmailAccountWithAiAndTokens } from "@/utils/user/get";
import { createEmailProvider } from "@/utils/email/provider";
import { excludeRepliedSendersFromColdEmail } from "@/utils/cold-email/exclude-replied-sender";
import {
  enqueueRepliedSenderExclusionRetry,
  repliedSenderExclusionRetryBody,
} from "@/utils/cold-email/exclude-replied-sender-retry";
import { sleep } from "@/utils/sleep";

export const maxDuration = 300;

export const POST = withError(
  "cold-email/exclude-replied-sender",
  withQstashOrInternal(async (request) => {
    const { emailAccountId, messageId, attempt } =
      repliedSenderExclusionRetryBody.parse(await request.json());
    const logger = request.logger.with({ emailAccountId, messageId, attempt });

    await sleep(Math.min(2 ** attempt * 1000, 30_000));

    const emailAccount = await getEmailAccountWithAiAndTokens({
      emailAccountId,
    });
    if (!emailAccount) {
      logger.warn("Skipping replied sender exclusion retry: account not found");
      return NextResponse.json({ ok: true });
    }

    const provider = await createEmailProvider({
      emailAccountId,
      provider: emailAccount.account.provider,
      logger,
    });
    const message = await provider.getMessage(messageId);

    try {
      await excludeRepliedSendersFromColdEmail({
        emailAccountId,
        message,
        provider,
        logger,
      });
    } catch (error) {
      const queued = await enqueueRepliedSenderExclusionRetry({
        emailAccountId,
        messageId,
        attempt: attempt + 1,
      });
      if (!queued) throw error;

      logger.info("Queued another replied sender exclusion retry");
    }

    return NextResponse.json({ ok: true });
  }),
);
