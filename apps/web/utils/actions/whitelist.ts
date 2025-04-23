"use server";

import { env } from "@/env";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { isActionError } from "@/utils/error";
import { createFilter } from "@/utils/gmail/filter";
import { GmailLabel } from "@/utils/gmail/label";
import { actionClient } from "@/utils/actions/safe-action";

export const whitelistInboxZeroAction = actionClient
  .metadata({ name: "whitelistInboxZero" })
  .action(async ({ ctx: { emailAccount } }) => {
    if (!env.WHITELIST_FROM) return;
    if (!emailAccount) return { error: "Email account not found" };

    const sessionResult = await getSessionAndGmailClient({
      accountId: emailAccount.accountId,
    });
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    await createFilter({
      gmail,
      from: env.WHITELIST_FROM,
      addLabelIds: ["CATEGORY_PERSONAL"],
      removeLabelIds: [GmailLabel.SPAM],
    });
  });
