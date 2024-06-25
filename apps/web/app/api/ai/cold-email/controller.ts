import { z } from "zod";
import type { gmail_v1 } from "googleapis";
import { parseJSON } from "@/utils/json";
import { chatCompletionObject, getAiProviderAndModel } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import { inboxZeroLabels } from "@/utils/label";
import { INBOX_LABEL_ID } from "@/utils/gmail/label";
import { getOrCreateLabel, labelMessage } from "@/utils/gmail/label";
import { ColdEmailSetting, ColdEmailStatus, type User } from "@prisma/client";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/app/api/ai/cold-email/prompt";
import { saveAiUsage } from "@/utils/usage";
import { chatCompletion } from "@/utils/llms";
import { stringifyEmail } from "@/utils/ai/choose-rule/stringify-email";

const aiResponseSchema = z.object({
  coldEmail: z.boolean().nullish(),
  reason: z.string().nullish(),
});

type ColdEmailBlockerReason = "hasPreviousEmail" | "ai";

export async function isColdEmail(options: {
  hasPreviousEmail: boolean;
  email: { from: string; subject: string; content: string };
  user: Pick<User, "email" | "coldEmailPrompt"> & UserAIFields;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
}> {
  if (options.hasPreviousEmail)
    return { isColdEmail: false, reason: "hasPreviousEmail" };

  // otherwise run through ai to see if it's a cold email
  const res = await aiIsColdEmail(options.email, options.user);

  return {
    isColdEmail: !!res.coldEmail,
    reason: "ai",
    aiReason: res.reason,
  };
}

async function aiIsColdEmail(
  email: { from: string; subject: string; content: string },
  user: Pick<User, "email" | "coldEmailPrompt"> & UserAIFields,
) {
  const system =
    "You are an assistant that decides if an email is a cold email or not.";

  const prompt = `Determine if this email is a cold email or not.

${user.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}

Return a JSON object with a "coldEmail" and "reason" field.
The "reason" should be a string that explains why the email is or isn't considered a cold email.

An example response is:
{
  "coldEmail": true,
  "reason": "This is someone trying to sell you services."
}

The email:

${stringifyEmail(email, 500)}
`;

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );
  const response = await chatCompletionObject({
    provider,
    model,
    apiKey: user.openAIApiKey,
    system,
    prompt,
    schema: aiResponseSchema,
  });

  if (response.usage) {
    await saveAiUsage({
      email: user.email || "",
      usage: response.usage,
      provider: user.aiProvider,
      model,
      label: "Cold email check",
    });
  }

  return response.object;
}

export async function runColdEmailBlocker(options: {
  hasPreviousEmail: boolean;
  email: {
    from: string;
    subject: string;
    content: string;
    messageId: string;
    threadId: string;
  };
  gmail: gmail_v1.Gmail;
  user: Pick<User, "id" | "email" | "coldEmailPrompt" | "coldEmailBlocker"> &
    UserAIFields;
}) {
  const response = await isColdEmail(options);
  if (response.isColdEmail)
    await blockColdEmail({ ...options, aiReason: response.aiReason || null });
}

async function blockColdEmail(options: {
  gmail: gmail_v1.Gmail;
  email: { from: string; messageId: string; threadId: string };
  user: Pick<User, "id" | "email" | "coldEmailBlocker">;
  aiReason: string | null;
}) {
  const { gmail, email, user, aiReason } = options;

  await prisma.coldEmail.upsert({
    where: { userId_fromEmail: { userId: user.id, fromEmail: email.from } },
    update: { status: ColdEmailStatus.AI_LABELED_COLD },
    create: {
      status: ColdEmailStatus.AI_LABELED_COLD,
      fromEmail: email.from,
      userId: user.id,
      reason: aiReason,
      messageId: email.messageId,
      threadId: email.threadId,
    },
  });

  if (
    user.coldEmailBlocker === ColdEmailSetting.LABEL ||
    user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL
  ) {
    if (!user.email) throw new Error("User email is required");
    const gmailLabel = await getOrCreateLabel({
      gmail,
      name: inboxZeroLabels.cold_email,
    });
    if (!gmailLabel?.id) throw new Error("No gmail label id");

    const shouldArchive =
      user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL;

    await labelMessage({
      gmail,
      messageId: email.messageId,
      addLabelIds: [gmailLabel.id],
      removeLabelIds: shouldArchive ? [INBOX_LABEL_ID] : undefined,
    });
  }
}
