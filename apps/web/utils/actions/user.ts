"use server";

import { z } from "zod";
import { auth, signOut } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { deleteUser } from "@/utils/user/delete";
import { extractGmailSignature } from "@/utils/gmail/signature";
import { getGmailClient } from "@/utils/gmail/client";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { parseMessage } from "@/utils/mail";
import { GmailLabel } from "@/utils/gmail/label";

const saveAboutBody = z.object({ about: z.string().max(2_000) });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export const saveAboutAction = withActionInstrumentation(
  "saveAbout",
  async (unsafeBody: SaveAboutBody) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const { success, data, error } = saveAboutBody.safeParse(unsafeBody);
    if (!success) return { error: error.message };

    await prisma.user.update({
      where: { email: session.user.email },
      data: { about: data.about },
    });
  },
);

const saveSignatureBody = z.object({ signature: z.string().max(2_000) });
export type SaveSignatureBody = z.infer<typeof saveSignatureBody>;

export const saveSignatureAction = withActionInstrumentation(
  "saveSignature",
  async (unsafeBody: SaveSignatureBody) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const { success, data, error } = saveSignatureBody.safeParse(unsafeBody);
    if (!success) return { error: error.message };

    await prisma.user.update({
      where: { email: session.user.email },
      data: { signature: data.signature },
    });
  },
);

export const loadSignatureFromGmailAction = withActionInstrumentation(
  "loadSignatureFromGmail",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

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
  },
);

export const resetAnalyticsAction = withActionInstrumentation(
  "resetAnalytics",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    await deleteTinybirdEmails({ email: session.user.email });
  },
);

export const deleteAccountAction = withActionInstrumentation(
  "deleteAccount",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    try {
      await signOut();
    } catch (error) {}

    await deleteUser({
      userId: session.user.id,
      email: session.user.email,
    });
  },
);

export const completedOnboardingAction = withActionInstrumentation(
  "completedOnboarding",
  async () => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.user.update({
      where: { id: session.user.id, completedOnboardingAt: null },
      data: { completedOnboardingAt: new Date(), completedOnboarding: true },
    });
  },
);

export const completedAppOnboardingAction = withActionInstrumentation(
  "completedAppOnboarding",
  async () => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.user.update({
      where: { id: session.user.id, completedAppOnboardingAt: null },
      data: { completedAppOnboardingAt: new Date() },
    });
  },
);

const saveOnboardingAnswersBody = z.object({
  surveyId: z.string().optional(),
  questions: z.any(),
  answers: z.any(),
});
type SaveOnboardingAnswersBody = z.infer<typeof saveOnboardingAnswersBody>;

export const saveOnboardingAnswersAction = withActionInstrumentation(
  "saveOnboardingAnswers",
  async (unsafeBody: SaveOnboardingAnswersBody) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    const { success, data, error } =
      saveOnboardingAnswersBody.safeParse(unsafeBody);
    if (!success) return { error: error.message };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingAnswers: data },
    });
  },
);
