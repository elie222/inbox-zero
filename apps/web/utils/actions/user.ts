"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { signOut } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { deleteUser } from "@/utils/user/delete";
import { extractGmailSignature } from "@/utils/gmail/signature";
import { getGmailClient } from "@/utils/gmail/client";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { GmailLabel } from "@/utils/gmail/label";
import { actionClient } from "@/utils/actions/safe-action";

const saveAboutBody = z.object({ about: z.string().max(2_000) });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export const saveAboutAction = actionClient
  .metadata({ name: "saveAbout" })
  .schema(saveAboutBody)
  .action(async ({ parsedInput: { about }, ctx: { userEmail } }) => {
    await prisma.emailAccount.update({
      where: { email: userEmail },
      data: { about },
    });

    revalidatePath("/settings");
  });

const saveSignatureBody = z.object({ signature: z.string().max(2_000) });
export type SaveSignatureBody = z.infer<typeof saveSignatureBody>;

export const saveSignatureAction = actionClient
  .metadata({ name: "saveSignature" })
  .schema(saveSignatureBody)
  .action(async ({ parsedInput: { signature }, ctx: { userEmail } }) => {
    await prisma.emailAccount.update({
      where: { email: userEmail },
      data: { signature },
    });

    revalidatePath("/settings");
  });

export const loadSignatureFromGmailAction = actionClient
  .metadata({ name: "loadSignatureFromGmail" })
  .action(async ({ ctx: { session } }) => {
    // 1. find last 5 sent emails
    const gmail = getGmailClient(session);
    const messages = await getMessages(gmail, {
      query: "from:me",
      maxResults: 5,
    });

    // 2. loop through emails till we find a signature
    for (const message of messages.messages || []) {
      if (!message.id) continue;
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
  .action(async ({ ctx: { userEmail } }) => {
    await prisma.emailMessage.deleteMany({
      where: { emailAccount: { email: userEmail } },
    });
  });

export const deleteAccountAction = actionClient
  .metadata({ name: "deleteAccount" })
  .action(async ({ ctx: { userId, userEmail } }) => {
    try {
      await signOut();
    } catch (error) {}

    await deleteUser({ userId, email: userEmail });
  });

export const completedOnboardingAction = actionClient
  .metadata({ name: "completedOnboarding" })
  .action(async ({ ctx: { userId } }) => {
    await prisma.user.update({
      where: { id: userId, completedOnboardingAt: null },
      data: { completedOnboardingAt: new Date() },
    });
  });

export const completedAppOnboardingAction = actionClient
  .metadata({ name: "completedAppOnboarding" })
  .action(async ({ ctx: { userId } }) => {
    await prisma.user.update({
      where: { id: userId, completedAppOnboardingAt: null },
      data: { completedAppOnboardingAt: new Date() },
    });
  });

const saveOnboardingAnswersBody = z.object({
  surveyId: z.string().optional(),
  questions: z.any(),
  answers: z.any(),
});

export const saveOnboardingAnswersAction = actionClient
  .metadata({ name: "saveOnboardingAnswers" })
  .schema(saveOnboardingAnswersBody)
  .action(
    async ({
      parsedInput: { surveyId, questions, answers },
      ctx: { userId },
    }) => {
      await prisma.user.update({
        where: { id: userId },
        data: { onboardingAnswers: { surveyId, questions, answers } },
      });
    },
  );
