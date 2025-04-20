"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { assessUser } from "@/utils/assess";
import { aiAnalyzeWritingStyle } from "@/utils/ai/knowledge/writing-style";
import { getAiUser } from "@/utils/user/get";
import { createScopedLogger } from "@/utils/logger";
import { formatBulletList } from "@/utils/string";
import { getSentMessages } from "@/utils/gmail/message";
import { getEmailForLLM } from "@/utils/get-email-from-message";

const logger = createScopedLogger("assess-user");

// to help with onboarding and provide the best flow to new users
export const assessUserAction = withActionInstrumentation(
  "assessUser",
  async () => {
    const session = await auth();
    const email = session?.user.email;
    if (!email) return { error: "Not authenticated" };

    const gmail = getGmailClient(session);

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email },
      select: { behaviorProfile: true },
    });

    if (emailAccount?.behaviorProfile) return { success: true, skipped: true };

    const result = await assessUser({ gmail });
    await saveBehaviorProfile(email, result);

    return { success: true };
  },
);

async function saveBehaviorProfile(
  email: string,
  assessment: Awaited<ReturnType<typeof assessUser>>,
) {
  await prisma.emailAccount.update({
    where: { email },
    data: { behaviorProfile: assessment },
  });
}

export const analyzeWritingStyleAction = withActionInstrumentation(
  "analyzeWritingStyle",
  async () => {
    const session = await auth();
    const email = session?.user.email;
    if (!email) return { error: "Not authenticated" };

    const user = await getAiUser({ email });
    if (!user) return { error: "User not found" };

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email },
      select: { writingStyle: true },
    });
    if (emailAccount?.writingStyle) return { success: true, skipped: true };

    // fetch last 20 sent emails
    const gmail = getGmailClient(session);
    const sentMessages = await getSentMessages(gmail, 20);

    // analyze writing style
    const style = await aiAnalyzeWritingStyle({
      emails: sentMessages.map((email) =>
        getEmailForLLM(email, { extractReply: true }),
      ),
      user,
    });

    if (!style) return;

    // save writing style
    const writingStyle = [
      style.typicalLength ? `Typical Length: ${style.typicalLength}` : null,
      style.formality ? `Formality: ${style.formality}` : null,
      style.commonGreeting ? `Common Greeting: ${style.commonGreeting}` : null,
      style.notableTraits.length
        ? `Notable Traits: ${formatBulletList(style.notableTraits)}`
        : null,
      style.examples.length
        ? `Examples: ${formatBulletList(style.examples)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    await prisma.emailAccount.update({
      where: { email },
      data: { writingStyle },
    });

    return { success: true };
  },
);
