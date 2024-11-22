import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { chatCompletionObject } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import { inboxZeroLabels } from "@/utils/label";
import { INBOX_LABEL_ID } from "@/utils/gmail/label";
import { getOrCreateLabel, labelMessage } from "@/utils/gmail/label";
import { ColdEmailSetting, ColdEmailStatus, type User } from "@prisma/client";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/app/api/ai/cold-email/prompt";
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
  console.debug("Checking is cold email");

  if (options.hasPreviousEmail)
    return { isColdEmail: false, reason: "hasPreviousEmail" };

  // otherwise run through ai to see if it's a cold email
  const res = await aiIsColdEmail(options.email, options.user);

  console.debug(`AI is cold email: ${res.coldEmail}`);

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

<instructions>
${user.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}
</instructions>

<outputFormat>
Return a JSON object with a "reason" and "coldEmail" field.
The "reason" should be a concise explanation that explains why the email is or isn't considered a cold email.
The "coldEmail" should be a boolean that is true if the email is a cold email and false otherwise.
</outputFormat>

<exampleResponse>
{
  "reason": "This is someone trying to sell you services.",
  "coldEmail": true
}
</exampleResponse>

<email>
${stringifyEmail(email, 500)}
</email>
`;

  const response = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema: aiResponseSchema,
    userEmail: user.email || "",
    usageLabel: "Cold email check",
  });

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
    const coldEmailLabel = await getOrCreateLabel({
      gmail,
      name: inboxZeroLabels.cold_email,
    });
    if (!coldEmailLabel?.id) console.error("No gmail label id");

    const shouldArchive =
      user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL;

    await labelMessage({
      gmail,
      messageId: email.messageId,
      // label email as "Cold Email"
      addLabelIds: coldEmailLabel?.id ? [coldEmailLabel.id] : undefined,
      // archive email
      removeLabelIds: shouldArchive ? [INBOX_LABEL_ID] : undefined,
    });
  }
}
