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

const aiResponseSchema = z.object({
  coldEmail: z.boolean().nullish(),
  expandEmail: z.boolean().nullish(),
});

type ColdEmailBlockerReason = "hasPreviousEmail" | "unsubscribeLink" | "ai";

export async function isColdEmail(options: {
  hasPreviousEmail: boolean;
  email: {
    from: string;
    subject: string;
    body: string;
  };
  user: Pick<User, "email" | "coldEmailPrompt"> & UserAIFields;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
}> {
  if (options.hasPreviousEmail)
    return { isColdEmail: false, reason: "hasPreviousEmail" };

  // otherwise run through ai to see if it's a cold email
  const isColdEmail = await aiIsColdEmail(options.email, options.user);

  return { isColdEmail: !!isColdEmail, reason: "ai" };
}

async function aiIsColdEmail(
  email: {
    from: string;
    subject: string;
    body: string;
  },
  user: Pick<User, "email" | "coldEmailPrompt"> & UserAIFields,
) {
  const message = `Determine if this email is a cold email or not.

${user.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}

Return a JSON object with a "coldEmail" and "expandEmail" field.

An example response is:
{
  "coldEmail": true,
  "expandEmail": false
}

Set "expandEmail" to true if want to read more of the email before deciding whether this is a cold email.

## Email

From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}
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
  if (!content) return false;

  try {
    const res = parseJSON(content);
    const parsedResponse = aiResponseSchema.parse(res);

    // TODO expand email if parsedResponse.expandEmail is true

    return parsedResponse.coldEmail;
  } catch (error) {
    console.error("Error parsing json:", content);
    return false;
  }
}

export async function runColdEmailBlocker(options: {
  hasPreviousEmail: boolean;
  email: {
    from: string;
    subject: string;
    body: string;
    messageId: string;
  };
  gmail: gmail_v1.Gmail;
  user: Pick<User, "id" | "email" | "coldEmailPrompt" | "coldEmailBlocker"> &
    UserAIFields;
}) {
  const response = await isColdEmail(options);

  if (response.isColdEmail) {
    console.log("Blocking cold email...");

    await blockColdEmail(options);
  }
}

async function blockColdEmail(options: {
  gmail: gmail_v1.Gmail;
  email: { from: string; messageId: string };
  user: Pick<User, "id" | "email" | "coldEmailBlocker">;
}) {
  const { gmail, email, user } = options;

  await prisma.newsletter.upsert({
    where: { email_userId: { email: email.from, userId: user.id } },
    update: { coldEmail: ColdEmailStatus.COLD_EMAIL },
    create: {
      coldEmail: ColdEmailStatus.COLD_EMAIL,
      email: email.from,
      userId: user.id,
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
