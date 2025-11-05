import { NextResponse } from "next/server";
import { captureException } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookResourceData } from "@/app/api/outlook/webhook/types";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import {
  validateWebhookAccount,
  getWebhookEmailAccount,
} from "@/utils/webhook/validate-webhook-account";
import type { Logger } from "@/utils/logger";

export async function processHistoryForUser({
  subscriptionId,
  resourceData,
  logger,
}: {
  subscriptionId: string;
  resourceData: OutlookResourceData;
  logger: Logger;
}) {
  const emailAccount = await getWebhookEmailAccount(
    {
      watchEmailsSubscriptionId: subscriptionId,
    },
    logger,
  );

  logger = logger.with({
    email: emailAccount?.email,
    emailAccountId: emailAccount?.id,
  });

  const validation = await validateWebhookAccount(emailAccount, logger);

  if (!validation.success) {
    logger.error("Error validating webhook account", {
      error: validation.response.status,
    });
    return validation.response;
  }

  const {
    emailAccount: validatedEmailAccount,
    hasAutomationRules,
    hasAiAccess: userHasAiAccess,
  } = validation.data;

  const accountProvider =
    validatedEmailAccount.account?.provider || "microsoft";

  const provider = await createEmailProvider({
    emailAccountId: validatedEmailAccount.id,
    provider: accountProvider,
  });

  try {
    await processHistoryItem(
      { messageId: resourceData.id },
      {
        provider,
        emailAccount: {
          ...validatedEmailAccount,
          account: { provider: accountProvider },
        },
        hasAutomationRules,
        hasAiAccess: userHasAiAccess,
        rules: validatedEmailAccount.rules,
        logger,
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Invalid grant", { email: validatedEmailAccount.email });
      return NextResponse.json({ ok: true });
    }

    captureException(
      error,
      { extra: { subscriptionId, resourceData } },
      validatedEmailAccount.email,
    );
    logger.error("Error processing webhook", {
      resourceData,
      email: validatedEmailAccount.email,
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });
    // returning 200 here, as otherwise Microsoft will keep retrying
    return NextResponse.json({ error: true });
  }
}
