"use server";

import { env } from "@/env";
import { getSessionAndGmailClient } from "@/utils/actions/helpers";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { isActionError } from "@/utils/error";
import { createFilter } from "@/utils/gmail/filter";
import { GmailLabel } from "@/utils/gmail/label";

export const whitelistInboxZeroAction = withActionInstrumentation(
  "whitelistInboxZero",
  async () => {
    if (!env.WHITELIST_FROM) return;

    const sessionResult = await getSessionAndGmailClient();
    if (isActionError(sessionResult)) return sessionResult;
    const { gmail } = sessionResult;

    await createFilter({
      gmail,
      from: env.WHITELIST_FROM,
      addLabelIds: ["CATEGORY_PERSONAL"],
      removeLabelIds: [GmailLabel.SPAM],
    });
  },
);
