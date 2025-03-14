"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailAccessToken, getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { assessUser } from "@/utils/assess";

// to help with onboarding and provide the best flow to new users
export const assessUserAction = withActionInstrumentation(
  "assessUser",
  async () => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not authenticated" };

    const gmail = getGmailClient(session);
    const token = await getGmailAccessToken(session);
    const accessToken = token?.token;

    if (!accessToken) throw new SafeError("Missing access token");

    const assessedUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { behaviorProfile: true },
    });

    if (assessedUser?.behaviorProfile) return { success: true, skipped: true };

    const result = await assessUser({ gmail, accessToken });
    await saveBehaviorProfile(session.user.email, result);

    return { success: true };
  },
);

async function saveBehaviorProfile(
  email: string,
  assessment: Awaited<ReturnType<typeof assessUser>>,
) {
  await prisma.user.update({
    where: { email },
    data: { behaviorProfile: assessment },
  });
}
