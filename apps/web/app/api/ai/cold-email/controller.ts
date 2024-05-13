import { z } from "zod";
import { type gmail_v1 } from "googleapis";
import { parseJSON } from "@/utils/json";
import { getAiProviderAndModel } from "@/utils/llms";
import { UserAIFields } from "@/utils/llms/types";
import { INBOX_LABEL_ID, getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelMessage } from "@/utils/gmail/label";
import { ColdEmailSetting, ColdEmailStatus, User } from "@prisma/client";
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
  const message = `Determine if this email is a cold email or not.

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
  const response = await chatCompletion(
    provider,
    model,
    user.openAIApiKey,
    [
      {
        role: "system",
        content:
          "You are an assistant that decides if an email is a cold email or not.",
      },
      {
        role: "user",
        content: message,
      },
    ],
    { jsonResponse: true },
  );

  if (response.usage) {
    await saveAiUsage({
      email: user.email || "",
      usage: response.usage,
      provider: user.aiProvider,
      model,
      label: "Cold email check",
    });
  }

  const content = response.response;

  // this is an error
  if (!content) return { coldEmail: false, reason: null };

  try {
    const res = parseJSON(content);
    const parsedResponse = aiResponseSchema.parse(res);

    return parsedResponse;
  } catch (error) {
    console.error("Error parsing json:", content);
    return { coldEmail: false, reason: null };
  }
}

export async function runColdEmailBlocker(options: {
  hasPreviousEmail: boolean;
  email: {
    from: string;
    subject: string;
    content: string;
    messageId: string;
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
  email: { from: string; messageId: string };
  user: Pick<User, "id" | "email" | "coldEmailBlocker">;
  aiReason: string | null;
}) {
  const { gmail, email, user, aiReason } = options;

  await prisma.newsletter.upsert({
    where: { email_userId: { email: email.from, userId: user.id } },
    update: { coldEmail: ColdEmailStatus.COLD_EMAIL },
    create: {
      coldEmail: ColdEmailStatus.COLD_EMAIL,
      email: email.from,
      userId: user.id,
      coldEmailReason: aiReason,
    },
  });

  if (
    user.coldEmailBlocker === ColdEmailSetting.LABEL ||
    user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL
  ) {
    if (!user.email) throw new Error("User email is required");
    const gmailLabel = await getOrCreateInboxZeroLabel({
      gmail,
      labelKey: "cold_email",
      email: user.email,
    });

    await labelMessage({
      gmail,
      messageId: email.messageId,
      addLabelIds:
        user.coldEmailBlocker === ColdEmailSetting.LABEL && gmailLabel?.id
          ? [gmailLabel.id]
          : undefined,
      removeLabelIds:
        user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL
          ? [INBOX_LABEL_ID]
          : undefined,
    });
  }
}
