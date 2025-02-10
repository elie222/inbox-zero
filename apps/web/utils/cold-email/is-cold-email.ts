import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { chatCompletionObject } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import { getOrCreateInboxZeroLabel, GmailLabel } from "@/utils/gmail/label";
import { labelMessage } from "@/utils/gmail/label";
import { ColdEmailSetting, ColdEmailStatus, type User } from "@prisma/client";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";
import { hasPreviousEmailsFromSenderOrDomain } from "@/utils/gmail/message";

const logger = createScopedLogger("ai-cold-email");

const aiResponseSchema = z.object({
  coldEmail: z.boolean().nullish(),
  reason: z.string().nullish(),
});

type ColdEmailBlockerReason = "hasPreviousEmail" | "ai" | "ai-already-labeled";

export async function isColdEmail({
  email,
  user,
  gmail,
}: {
  email: {
    from: string;
    subject: string;
    content: string;
    date?: Date;
    threadId?: string;
    messageId: string | null;
  };
  user: Pick<User, "id" | "email" | "coldEmailPrompt"> & UserAIFields;
  gmail: gmail_v1.Gmail;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
}> {
  const loggerOptions = {
    userId: user.id,
    email: user.email,
    threadId: email.threadId,
    messageId: email.messageId,
  };

  logger.info("Checking is cold email", loggerOptions);

  // Check if we marked it as a cold email already
  const isColdEmailer = await isKnownColdEmailSender({
    from: email.from,
    userId: user.id,
  });

  if (isColdEmailer) {
    logger.info("Known cold email sender", {
      ...loggerOptions,
      from: email.from,
    });
    return { isColdEmail: true, reason: "ai-already-labeled" };
  }

  const hasPreviousEmail =
    email.date && email.messageId
      ? await hasPreviousEmailsFromSenderOrDomain(gmail, {
          from: email.from,
          date: email.date,
          messageId: email.messageId,
        })
      : false;

  if (hasPreviousEmail) {
    logger.info("Has previous email", loggerOptions);
    return { isColdEmail: false, reason: "hasPreviousEmail" };
  }

  // otherwise run through ai to see if it's a cold email
  const res = await aiIsColdEmail(email, user);

  logger.info("AI is cold email?", {
    ...loggerOptions,
    coldEmail: res.coldEmail,
  });

  return {
    isColdEmail: !!res.coldEmail,
    reason: "ai",
    aiReason: res.reason,
  };
}

async function isKnownColdEmailSender({
  from,
  userId,
}: {
  from: string;
  userId: string;
}) {
  const coldEmail = await prisma.coldEmail.findUnique({
    where: {
      userId_fromEmail: { userId, fromEmail: from },
      status: ColdEmailStatus.AI_LABELED_COLD,
    },
    select: { id: true },
  });
  return !!coldEmail;
}

async function aiIsColdEmail(
  email: { from: string; subject: string; content: string },
  user: Pick<User, "email" | "coldEmailPrompt"> & UserAIFields,
) {
  const system = `You are an assistant that decides if an email is a cold email or not.

<instructions>
${user.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}
</instructions>

<output_format>
Return a JSON object with a "reason" and "coldEmail" field.
The "reason" should be a concise explanation that explains why the email is or isn't considered a cold email.
The "coldEmail" should be a boolean that is true if the email is a cold email and false otherwise.
</output_format>

<example_response>
{
  "reason": "This is someone trying to sell you services.",
  "coldEmail": true
}
</example_response>

Determine if the email is a cold email or not.`;

  const prompt = `<email>
${stringifyEmail(email, 500)}
</email>`;

  logger.trace("AI is cold email prompt", { system, prompt });

  const response = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema: aiResponseSchema,
    userEmail: user.email || "",
    usageLabel: "Cold email check",
  });

  logger.trace("AI is cold email response", { response: response.object });

  return response.object;
}

export async function runColdEmailBlocker(options: {
  email: {
    from: string;
    subject: string;
    content: string;
    messageId: string;
    threadId: string;
    date: Date;
  };
  gmail: gmail_v1.Gmail;
  user: Pick<User, "id" | "email" | "coldEmailPrompt" | "coldEmailBlocker"> &
    UserAIFields;
}) {
  const response = await isColdEmail(options);
  if (response.isColdEmail)
    await blockColdEmail({ ...options, aiReason: response.aiReason || null });
  return response;
}

export async function blockColdEmail(options: {
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
    user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
    user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL
  ) {
    if (!user.email) throw new Error("User email is required");
    const coldEmailLabel = await getOrCreateInboxZeroLabel({
      gmail,
      key: "cold_email",
    });
    if (!coldEmailLabel?.id)
      logger.error("No gmail label id", { userId: user.id });

    const shouldArchive =
      user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
      user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL;

    const shouldMarkRead =
      user.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL;

    const addLabelIds: string[] = [];
    if (coldEmailLabel?.id) addLabelIds.push(coldEmailLabel.id);

    const removeLabelIds: string[] = [];
    if (shouldArchive) removeLabelIds.push(GmailLabel.INBOX);
    if (shouldMarkRead) removeLabelIds.push(GmailLabel.UNREAD);

    await labelMessage({
      gmail,
      messageId: email.messageId,
      addLabelIds: addLabelIds.length ? addLabelIds : undefined,
      removeLabelIds: removeLabelIds.length ? removeLabelIds : undefined,
    });
  }
}
