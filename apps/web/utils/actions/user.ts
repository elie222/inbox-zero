"use server";

import { z } from "zod";
import { auth, signOut } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { deleteTinybirdEmails } from "@inboxzero/tinybird";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { deleteUser } from "@/utils/user/delete";

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
