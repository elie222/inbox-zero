import { z } from "zod";
import { type gmail_v1 } from "googleapis";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { parseJSON } from "@/utils/json";
import { UserAIFields, getOpenAI } from "@/utils/openai";
import { INBOX_LABEL_ID, getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelMessage } from "@/utils/gmail/label";
import { ColdEmailSetting, ColdEmailStatus } from "@prisma/client";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/app/api/ai/cold-email/prompt";

const aiResponseSchema = z.object({
  coldEmail: z.boolean().nullish(),
  expandEmail: z.boolean().nullish(),
});

export async function isColdEmail(options: {
  hasPreviousEmail: boolean;
  unsubscribeLink?: string;
  email: {
    from: string;
    subject: string;
    body: string;
  };
  userOptions: UserAIFields & { coldEmailPrompt: string | null };
}) {
  if (options.hasPreviousEmail) return false;
  // need to check how true this is in practice
  if (options.unsubscribeLink) return false;

  // otherwise run through ai to see if it's a cold email
  const isColdEmail = await aiIsColdEmail(options.email, options.userOptions);

  return isColdEmail;
}

async function aiIsColdEmail(
  email: {
    from: string;
    subject: string;
    body: string;
  },
  userOptions: UserAIFields & { coldEmailPrompt: string | null },
) {
  const message = `Determine if this email is a cold email or not.

${userOptions.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}

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

  const response = await getOpenAI(
    userOptions.openAIApiKey,
  ).chat.completions.create({
    model: userOptions.aiModel || DEFAULT_AI_MODEL,
    response_format: { type: "json_object" },
    messages: [
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
  });

  const content = response.choices[0].message.content;

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
  unsubscribeLink?: string;
  email: {
    from: string;
    subject: string;
    body: string;
    messageId: string;
  };
  userOptions: UserAIFields & { coldEmailPrompt: string | null };
  gmail: gmail_v1.Gmail;
  coldEmailBlocker: ColdEmailSetting;
  userId: string;
  userEmail: string;
}) {
  const yes = await isColdEmail(options);

  if (yes) {
    console.log("Blocking cold email...");

    await blockColdEmail(options);
  }
}

async function blockColdEmail(options: {
  gmail: gmail_v1.Gmail;
  email: { from: string; messageId: string };
  userId: string;
  userEmail: string;
  coldEmailBlocker: ColdEmailSetting;
}) {
  const { gmail, email, userId, userEmail, coldEmailBlocker } = options;

  await prisma.newsletter.upsert({
    where: { email_userId: { email: email.from, userId } },
    update: { coldEmail: ColdEmailStatus.COLD_EMAIL },
    create: {
      coldEmail: ColdEmailStatus.COLD_EMAIL,
      email: email.from,
      userId,
    },
  });

  if (
    coldEmailBlocker === ColdEmailSetting.LABEL ||
    coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL
  ) {
    const gmailLabel = await getOrCreateInboxZeroLabel({
      gmail,
      labelKey: "cold_email",
      email: userEmail,
    });

    await labelMessage({
      gmail,
      messageId: email.messageId,
      addLabelIds:
        coldEmailBlocker === ColdEmailSetting.LABEL && gmailLabel?.id
          ? [gmailLabel.id]
          : undefined,
      removeLabelIds:
        coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL
          ? [INBOX_LABEL_ID]
          : undefined,
    });
  }
}
