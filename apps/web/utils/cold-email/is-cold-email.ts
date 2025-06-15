import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getOrCreateInboxZeroLabel, GmailLabel } from "@/utils/gmail/label";
import { labelMessage } from "@/utils/gmail/label";
import type { ColdEmail } from "@prisma/client";
import {
  ColdEmailSetting,
  ColdEmailStatus,
  type EmailAccount,
} from "@prisma/client";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";
import { hasPreviousCommunicationsWithSenderOrDomain } from "@/utils/gmail/message";
import type { EmailForLLM } from "@/utils/types";

const logger = createScopedLogger("ai-cold-email");

type ColdEmailBlockerReason = "hasPreviousEmail" | "ai" | "ai-already-labeled";

export async function isColdEmail({
  email,
  emailAccount,
  gmail,
}: {
  email: EmailForLLM & { threadId?: string };
  emailAccount: Pick<EmailAccount, "coldEmailPrompt"> & EmailAccountWithAI;
  gmail: gmail_v1.Gmail;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
}> {
  const loggerOptions = {
    email: emailAccount.email,
    threadId: email.threadId,
    messageId: email.id,
  };

  logger.info("Checking is cold email", loggerOptions);

  // Check if we marked it as a cold email already
  const isColdEmailer = await isKnownColdEmailSender({
    from: email.from,
    emailAccountId: emailAccount.id,
  });

  if (isColdEmailer) {
    logger.info("Known cold email sender", {
      ...loggerOptions,
      from: email.from,
    });
    return { isColdEmail: true, reason: "ai-already-labeled" };
  }

  const hasPreviousEmail =
    email.date && email.id
      ? await hasPreviousCommunicationsWithSenderOrDomain(gmail, {
          from: email.from,
          date: email.date,
          messageId: email.id,
        })
      : false;

  if (hasPreviousEmail) {
    logger.info("Has previous email", loggerOptions);
    return { isColdEmail: false, reason: "hasPreviousEmail" };
  }

  // otherwise run through ai to see if it's a cold email
  const res = await aiIsColdEmail(email, emailAccount);

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
  emailAccountId,
}: {
  from: string;
  emailAccountId: string;
}) {
  const coldEmail = await prisma.coldEmail.findUnique({
    where: {
      emailAccountId_fromEmail: {
        emailAccountId,
        fromEmail: from,
      },
      status: ColdEmailStatus.AI_LABELED_COLD,
    },
    select: { id: true },
  });
  return !!coldEmail;
}

async function aiIsColdEmail(
  email: EmailForLLM,
  emailAccount: Pick<EmailAccount, "coldEmailPrompt"> & EmailAccountWithAI,
) {
  const system = `You are an assistant that decides if an email is a cold email or not.

<instructions>
${emailAccount.coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}
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
    userAi: emailAccount.user,
    system,
    prompt,
    schema: z.object({
      coldEmail: z.boolean(),
      reason: z.string(),
    }),
    userEmail: emailAccount.email,
    usageLabel: "Cold email check",
  });

  logger.trace("AI is cold email response", { response: response.object });

  return response.object;
}

export async function runColdEmailBlocker(options: {
  email: EmailForLLM & { threadId: string };
  gmail: gmail_v1.Gmail;
  emailAccount: Pick<EmailAccount, "coldEmailPrompt" | "coldEmailBlocker"> &
    EmailAccountWithAI;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
  coldEmailId?: string | null;
}> {
  const response = await isColdEmail(options);

  if (!response.isColdEmail) return { ...response, coldEmailId: null };

  const coldEmail = await blockColdEmail({
    ...options,
    aiReason: response.aiReason ?? null,
  });
  return { ...response, coldEmailId: coldEmail.id };
}

export async function blockColdEmail(options: {
  gmail: gmail_v1.Gmail;
  email: { from: string; id: string; threadId: string };
  emailAccount: Pick<EmailAccount, "coldEmailBlocker"> & EmailAccountWithAI;
  aiReason: string | null;
}): Promise<ColdEmail> {
  const { gmail, email, emailAccount, aiReason } = options;

  const coldEmail = await prisma.coldEmail.upsert({
    where: {
      emailAccountId_fromEmail: {
        emailAccountId: emailAccount.id,
        fromEmail: email.from,
      },
    },
    update: { status: ColdEmailStatus.AI_LABELED_COLD },
    create: {
      status: ColdEmailStatus.AI_LABELED_COLD,
      fromEmail: email.from,
      emailAccountId: emailAccount.id,
      reason: aiReason,
      messageId: email.id,
      threadId: email.threadId,
    },
  });

  if (
    emailAccount.coldEmailBlocker === ColdEmailSetting.LABEL ||
    emailAccount.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
    emailAccount.coldEmailBlocker ===
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL
  ) {
    if (!emailAccount.email) throw new Error("User email is required");
    const coldEmailLabel = await getOrCreateInboxZeroLabel({
      gmail,
      key: "cold_email",
    });
    if (!coldEmailLabel?.id)
      logger.error("No gmail label id", { emailAccountId: emailAccount.id });

    const shouldArchive =
      emailAccount.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
      emailAccount.coldEmailBlocker ===
        ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL;

    const shouldMarkRead =
      emailAccount.coldEmailBlocker ===
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL;

    const addLabelIds: string[] = [];
    if (coldEmailLabel?.id) addLabelIds.push(coldEmailLabel.id);

    const removeLabelIds: string[] = [];
    if (shouldArchive) removeLabelIds.push(GmailLabel.INBOX);
    if (shouldMarkRead) removeLabelIds.push(GmailLabel.UNREAD);

    await labelMessage({
      gmail,
      messageId: email.id,
      addLabelIds: addLabelIds.length ? addLabelIds : undefined,
      removeLabelIds: removeLabelIds.length ? removeLabelIds : undefined,
    });
  }

  return coldEmail;
}
