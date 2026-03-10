"use server";

import { env } from "@/env";
import { GmailLabel } from "@/utils/gmail/label";
import { actionClient } from "@/utils/actions/safe-action";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { createEmailProvider } from "@/utils/email/provider";
import prisma from "@/utils/prisma";

const RECENT_SIGNUP_DAYS = 1;

export const whitelistInboxZeroAction = actionClient
  .metadata({ name: "whitelistInboxZero" })
  .action(async ({ ctx: { emailAccountId, userId, provider, logger } }) => {
    if (!env.WHITELIST_FROM) return;
    if (!isGoogleProvider(provider)) return;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { createdAt: true },
    });

    if (!user) return;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - RECENT_SIGNUP_DAYS);
    if (user.createdAt < cutoff) return;

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
