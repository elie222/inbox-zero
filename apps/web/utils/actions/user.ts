"use server";

import { z } from "zod";
import { after } from "next/server";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";
import { extractGmailSignature } from "@/utils/gmail/signature";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/gmail/message";
import { GmailLabel } from "@/utils/gmail/label";
import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";
import { SafeError } from "@/utils/error";
import { updateAccountSeats } from "@/utils/premium/server";
import { betterAuthConfig } from "@/utils/auth";
import { headers } from "next/headers";

const saveAboutBody = z.object({ about: z.string().max(2000) });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export const saveAboutAction = actionClient
  .metadata({ name: "saveAbout" })
  .schema(saveAboutBody)
  .action(async ({ parsedInput: { about }, ctx: { emailAccountId } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { about },
    });
  });

const saveSignatureBody = z.object({ signature: z.string().max(2000) });
export type SaveSignatureBody = z.infer<typeof saveSignatureBody>;

export const saveSignatureAction = actionClient
  .metadata({ name: "saveSignature" })
  .schema(saveSignatureBody)
  .action(async ({ parsedInput: { signature }, ctx: { emailAccountId } }) => {
    await prisma.emailAccount.update({
      where: { id: emailAccountId },
      data: { signature },
    });
  });

export const loadSignatureFromGmailAction = actionClient
  .metadata({ name: "loadSignatureFromGmail" })
  .action(async ({ ctx: { emailAccountId } }) => {
    // 1. find last 5 sent emails
    const gmail = await getGmailClientForEmail({ emailAccountId });
    // TODO: Use email provider to get the messages which will parse them internally
    // getSentMessages() from email provider uses label:sent vs from:me, so further testing is needed
    const messages = await getMessages(gmail, {
      query: "from:me",
      maxResults: 5,
    });

    // 2. loop through emails till we find a signature
    for (const message of messages.messages || []) {
      if (!message.id) continue;
      // TODO: Use email provider to get the message which will parse it internally
      const messageWithPayload = await getMessage(message.id, gmail);
      const parsedEmail = parseMessage(messageWithPayload);
      if (!parsedEmail.labelIds?.includes(GmailLabel.SENT)) continue;
      if (!parsedEmail.textHtml) continue;

      const signature = extractGmailSignature(parsedEmail.textHtml);
      if (signature) {
        return { signature };
      }
    }

    return { signature: "" };
  });

export const resetAnalyticsAction = actionClient
  .metadata({ name: "resetAnalytics" })
  .action(async ({ ctx: { emailAccountId } }) => {
    await prisma.emailMessage.deleteMany({
      where: { emailAccountId },
    });
  });

export const deleteAccountAction = actionClientUser
  .metadata({ name: "deleteAccount" })
  .action(async ({ ctx: { userId } }) => {
    try {
      await betterAuthConfig.api.signOut({
        headers: await headers(),
      });
    } catch {}
    await deleteUser({ userId });
  });

export const deleteEmailAccountAction = actionClientUser
  .metadata({ name: "deleteEmailAccount" })
  .schema(z.object({ emailAccountId: z.string() }))
  .action(async ({ ctx: { userId }, parsedInput: { emailAccountId } }) => {
    const emailAccount = await prisma.emailAccount.findUnique({
      where: { id: emailAccountId, userId },
      select: {
        email: true,
        accountId: true,
        user: { select: { email: true } },
      },
    });

    if (!emailAccount) throw new SafeError("Email account not found");
    if (!emailAccount.accountId) throw new SafeError("Account id not found");

    if (emailAccount.email === emailAccount.user.email)
      throw new SafeError(
        "Cannot delete primary email account. Go to the Settings page to delete your entire account.",
      );

    await prisma.account.delete({
      where: { id: emailAccount.accountId, userId },
    });

    after(async () => {
      await updateAccountSeats({ userId });
    });
  });
