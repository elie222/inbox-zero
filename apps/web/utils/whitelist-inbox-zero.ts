import "server-only";
import { env } from "@/env";
import { GmailLabel } from "@/utils/gmail/label";
import { isGoogleProvider } from "@/utils/email/provider-types";
import type { EmailProvider } from "@/utils/email/types";
import prisma from "@/utils/prisma";

const RECENT_SIGNUP_DAYS = 1;

export async function whitelistInboxZero({
  userId,
  emailProvider,
}: {
  userId: string;
  emailProvider: EmailProvider;
}) {
  if (!env.WHITELIST_FROM) return;
  if (!isGoogleProvider(emailProvider.name)) return;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true },
  });

  if (!user) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_SIGNUP_DAYS);
  if (user.createdAt < cutoff) return;

  await emailProvider.createFilter({
    from: env.WHITELIST_FROM,
    addLabelIds: ["CATEGORY_PERSONAL", GmailLabel.IMPORTANT],
    removeLabelIds: [GmailLabel.SPAM],
  });
}
