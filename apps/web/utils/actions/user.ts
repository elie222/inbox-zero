"use server";

import { z } from "zod";
import { deleteContact as deleteLoopsContact } from "@inboxzero/loops";
import { deleteContact as deleteResendContact } from "@inboxzero/resend";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { deleteInboxZeroLabels, deleteUserLabels } from "@/utils/redis/label";
import { deleteUserStats } from "@/utils/redis/stats";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { deleteTinybirdAiCalls } from "@inboxzero/tinybird-ai-analytics";
import { deletePosthogUser } from "@/utils/posthog";
import { captureException } from "@/utils/error";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { unwatchEmails } from "@/app/api/google/watch/controller";

const saveAboutBody = z.object({ about: z.string().max(2_000) });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export const saveAboutAction = withActionInstrumentation(
  "saveAbout",
  async (options: SaveAboutBody) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    await prisma.user.update({
      where: { email: session.user.email },
      data: { about: options.about },
    });
  },
);

export const deleteAccountAction = withActionInstrumentation(
  "deleteAccount",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    try {
      await Promise.allSettled([
        deleteUserLabels({ email: session.user.email }),
        deleteInboxZeroLabels({ email: session.user.email }),
        deleteUserStats({ email: session.user.email }),
        deleteTinybirdEmails({ email: session.user.email }),
        deleteTinybirdAiCalls({ userId: session.user.email }),
        deletePosthogUser({ email: session.user.email }),
        deleteLoopsContact(session.user.email),
        deleteResendContact({ email: session.user.email }),
        unwatchEmails({
          userId: session.user.id,
          access_token: session.accessToken ?? null,
          refresh_token: null,
        }),
      ]);
    } catch (error) {
      console.error("Error while deleting account: ", error);
      captureException(error, undefined, session.user.email);
    }

    await prisma.user.delete({ where: { email: session.user.email } });
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

export const saveOnboardingAnswersAction = withActionInstrumentation(
  "saveOnboardingAnswers",
  async (onboardingAnswers: {
    surveyId?: string;
    questions: any;
    answers: Record<string, string>;
  }) => {
    const session = await auth();
    if (!session?.user.id) return { error: "Not logged in" };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { onboardingAnswers },
    });
  },
);
