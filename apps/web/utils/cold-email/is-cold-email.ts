import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
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
import type { EmailForLLM } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getOrCreateOutlookFolderIdByName } from "@/utils/outlook/folders";
import { getOutlookClientForEmail } from "@/utils/account";

const logger = createScopedLogger("ai-cold-email");

type ColdEmailBlockerReason = "hasPreviousEmail" | "ai" | "ai-already-labeled";

export async function isColdEmail({
  email,
  emailAccount,
  provider,
  modelType,
}: {
  email: EmailForLLM & { threadId?: string };
  emailAccount: Pick<EmailAccount, "coldEmailPrompt"> & EmailAccountWithAI;
  provider: EmailProvider;
  modelType?: ModelType;
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
      ? await provider.hasPreviousCommunicationsWithSenderOrDomain({
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
  const res = await aiIsColdEmail(email, emailAccount, modelType);

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
  modelType?: ModelType,
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

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Cold email check",
    modelOptions,
  });

  const response = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      coldEmail: z.boolean(),
      reason: z.string(),
    }),
  });

  return response.object;
}

export async function runColdEmailBlocker(options: {
  email: EmailForLLM & { threadId: string };
  provider: EmailProvider;
  emailAccount: Pick<EmailAccount, "coldEmailPrompt" | "coldEmailBlocker"> &
    EmailAccountWithAI;
  modelType: ModelType;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
  coldEmailId?: string | null;
}> {
  const response = await isColdEmail({
    email: options.email,
    emailAccount: options.emailAccount,
    provider: options.provider,
    modelType: options.modelType,
  });

  if (!response.isColdEmail) return { ...response, coldEmailId: null };

  const coldEmail = await blockColdEmail({
    ...options,
    aiReason: response.aiReason ?? null,
  });
  return { ...response, coldEmailId: coldEmail.id };
}

// New function that works with EmailProvider
export async function blockColdEmail(options: {
  provider: EmailProvider;
  email: { from: string; id: string; threadId: string };
  emailAccount: Pick<EmailAccount, "coldEmailBlocker"> & EmailAccountWithAI;
  aiReason: string | null;
}): Promise<ColdEmail> {
  const { provider, email, emailAccount, aiReason } = options;

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

    // For Outlook, we'll use categories instead of labels
    const coldEmailLabel =
      await provider.getOrCreateInboxZeroLabel("cold_email");

    const shouldArchive =
      emailAccount.coldEmailBlocker === ColdEmailSetting.ARCHIVE_AND_LABEL ||
      emailAccount.coldEmailBlocker ===
        ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL;

    const shouldMarkRead =
      emailAccount.coldEmailBlocker ===
      ColdEmailSetting.ARCHIVE_AND_READ_AND_LABEL;

    // For Outlook, we'll use the provider's labelMessage method
    // The provider will handle the differences between Gmail labels and Outlook categories
    if (coldEmailLabel?.name) {
      await provider.labelMessage(email.id, coldEmailLabel.name);
    }

    // For archiving and marking as read, we'll need to implement these in the provider
    if (shouldArchive) {
      if (provider.name === "microsoft") {
        const outlook = await getOutlookClientForEmail({
          emailAccountId: emailAccount.id,
        });
        // TODO: move "Cold Emails"toa const or allow the user to set the folder
        const folderId = await getOrCreateOutlookFolderIdByName(
          outlook,
          "Cold Emails",
        );
        await provider.moveThreadToFolder(
          email.threadId,
          emailAccount.email,
          folderId,
        );
      } else {
        await provider.archiveThread(email.threadId, emailAccount.email);
      }
    }

    if (shouldMarkRead) {
      await provider.markReadThread(email.threadId, true);
    }
  }

  return coldEmail;
}
