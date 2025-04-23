"use server";

import prisma from "@/utils/prisma";
import { assessUser } from "@/utils/assess";
import { aiAnalyzeWritingStyle } from "@/utils/ai/knowledge/writing-style";
import { formatBulletList } from "@/utils/string";
import { getSentMessages } from "@/utils/gmail/message";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { actionClient } from "@/utils/actions/safe-action";
import { getGmailClientForEmail } from "@/utils/account";

// to help with onboarding and provide the best flow to new users
export const assessUserAction = actionClient
  .metadata({ name: "assessUser" })
  .action(async ({ ctx: { email } }) => {
    const gmail = await getGmailClientForEmail({ email });

    const emailAccount = await prisma.emailAccount.findUnique({
      where: { email },
      select: { behaviorProfile: true },
    });

    if (emailAccount?.behaviorProfile) return { success: true, skipped: true };

    const result = await assessUser({ gmail });
    await prisma.emailAccount.update({
      where: { email },
      data: { behaviorProfile: result },
    });

    return { success: true };
  });

export const analyzeWritingStyleAction = actionClient
  .metadata({ name: "analyzeWritingStyle" })
  .action(async ({ ctx: { email, emailAccount } }) => {
    if (!emailAccount) return { error: "Email account not found" };

    if (emailAccount?.writingStyle) return { success: true, skipped: true };

    // fetch last 20 sent emails
    const gmail = await getGmailClientForEmail({ email });
    const sentMessages = await getSentMessages(gmail, 20);

    // analyze writing style
    const style = await aiAnalyzeWritingStyle({
      emails: sentMessages.map((email) =>
        getEmailForLLM(email, { extractReply: true }),
      ),
      user: emailAccount,
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
  });
