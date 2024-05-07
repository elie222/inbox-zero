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

const saveAboutBody = z.object({ about: z.string() });
export type SaveAboutBody = z.infer<typeof saveAboutBody>;

export async function saveAboutAction(options: SaveAboutBody) {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

  await prisma.user.update({
    where: { email: session.user.email },
    data: { about: options.about },
  });
}

export async function deleteAccountAction() {
  const session = await auth();
  if (!session?.user.email) throw new Error("Not logged in");

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
    ]);
  } catch (error) {
    console.error("Error while deleting account: ", error);
    captureException(error);
  }

  await prisma.user.delete({ where: { email: session.user.email } });
}

export async function completedOnboarding() {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { completedOnboarding: true },
  });
}

export async function saveOnboardingAnswers(onboardingAnswers: {
  surveyId?: string;
  questions: any;
  answers: Record<string, string>;
}) {
  const session = await auth();
  if (!session?.user.id) throw new Error("Not logged in");

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingAnswers },
  });
}
