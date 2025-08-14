"use server";

import { env } from "@/env";
import { createFilter } from "@/utils/gmail/filter";
import { GmailLabel } from "@/utils/gmail/label";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";
import { isGmailProvider } from "@/utils/email/provider-types";

export const whitelistInboxZeroAction = actionClient
  .metadata({ name: "whitelistInboxZero" })
  .action(async ({ ctx: { emailAccountId, provider } }) => {
    if (!env.WHITELIST_FROM) return;
    if (!isGmailProvider(provider)) return;

    const gmail = await getGmailClientForEmail({ emailAccountId });

    await createFilter({
      gmail,
      from: env.WHITELIST_FROM,
      addLabelIds: ["CATEGORY_PERSONAL"],
      removeLabelIds: [GmailLabel.SPAM],
    });
  });
