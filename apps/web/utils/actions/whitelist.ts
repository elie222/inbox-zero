"use server";

import { env } from "@/env";
import { GmailLabel } from "@/utils/gmail/label";
import { actionClient } from "@/utils/actions/safe-action";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { createEmailProvider } from "@/utils/email/provider";

export const whitelistInboxZeroAction = actionClient
  .metadata({ name: "whitelistInboxZero" })
  .action(async ({ ctx: { emailAccountId, provider, logger } }) => {
    if (!env.WHITELIST_FROM) return;
    if (!isGoogleProvider(provider)) return;

    const emailProvider = await createEmailProvider({
      emailAccountId,
      provider,
      logger,
    });

    await emailProvider.createFilter({
      from: env.WHITELIST_FROM,
      addLabelIds: ["CATEGORY_PERSONAL", GmailLabel.IMPORTANT],
      removeLabelIds: [GmailLabel.SPAM],
    });
  });
