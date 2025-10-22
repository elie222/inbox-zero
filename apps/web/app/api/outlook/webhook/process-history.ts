import { NextResponse } from "next/server";
import { captureException } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookResourceData } from "@/app/api/outlook/webhook/types";
import { processHistoryItem } from "@/app/api/outlook/webhook/process-history-item";
import { logger } from "@/app/api/outlook/webhook/logger";
import {
  validateWebhookAccount,
  getWebhookEmailAccount,
} from "@/utils/webhook/validate-webhook-account";

export async function processHistoryForUser({
  subscriptionId,
  resourceData,
}: {
  subscriptionId: string;
  resourceData: OutlookResourceData;
}) {
  const emailAccount = await getWebhookEmailAccount(
    {
      watchEmailsSubscriptionId: subscriptionId,
    },
    logger,
  );

  const validation = await validateWebhookAccount(emailAccount, logger);

  if (!validation.success) {
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
    await processHistoryItem(resourceData, {
      provider,
      hasAutomationRules,
      hasAiAccess: userHasAiAccess,
      rules: validatedEmailAccount.rules,
      emailAccount: {
        ...validatedEmailAccount,
        account: { provider: accountProvider },
      },
    });

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
      subscriptionId,
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
