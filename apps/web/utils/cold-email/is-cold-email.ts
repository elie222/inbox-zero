import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ColdEmail, Rule } from "@prisma/client";
import { ColdEmailStatus } from "@prisma/client";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { extractEmailAddress } from "@/utils/email";

export const COLD_EMAIL_FOLDER_NAME = "Cold Emails";

type ColdEmailBlockerReason = "hasPreviousEmail" | "ai" | "ai-already-labeled";

export async function isColdEmail({
  email,
  emailAccount,
  provider,
  modelType,
  coldEmailRule,
}: {
  email: EmailForLLM & { threadId?: string };
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  modelType?: ModelType;
  coldEmailRule: Pick<Rule, "instructions"> | null;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
}> {
  const logger = createScopedLogger("ai-cold-email").with({
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    threadId: email.threadId,
    messageId: email.id,
  });

  logger.info("Checking is cold email");

  // Check if we marked it as a cold email already
  const isColdEmailer = await isKnownColdEmailSender({
    from: email.from,
    emailAccountId: emailAccount.id,
  });

  if (isColdEmailer) {
    logger.info("Known cold email sender", {
      from: email.from,
    });
    return { isColdEmail: true, reason: "ai-already-labeled" };
  }

  const hasPreviousEmail =
    email.date && email.id
      ? await provider.hasPreviousCommunicationsWithSenderOrDomain({
          from: extractEmailAddress(email.from) || email.from,
          date: email.date,
          messageId: email.id,
        })
      : false;

  if (hasPreviousEmail) {
    logger.info("Has previous email");
    return { isColdEmail: false, reason: "hasPreviousEmail" };
  }

  // run through ai to see if it's a cold email
  const res = await aiIsColdEmail(
    email,
    emailAccount,
    coldEmailRule?.instructions || DEFAULT_COLD_EMAIL_PROMPT,
    modelType,
  );

  logger.info("AI is cold email?", {
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
  emailAccount: EmailAccountWithAI,
  coldEmailPrompt: string,
  modelType?: ModelType,
) {
  const system = `You are an assistant that decides if an email is a cold email or not.

<instructions>
${coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}
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
    emailAccount,
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

export async function saveColdEmail({
  email,
  emailAccount,
  aiReason,
}: {
  email: { from: string; id: string; threadId: string };
  emailAccount: EmailAccountWithAI;
  aiReason: string | null;
}): Promise<ColdEmail> {
  const from = extractEmailAddress(email.from) || email.from;

  return await prisma.coldEmail.upsert({
    where: {
      emailAccountId_fromEmail: {
        emailAccountId: emailAccount.id,
        fromEmail: from,
      },
    },
    update: { status: ColdEmailStatus.AI_LABELED_COLD },
    create: {
      status: ColdEmailStatus.AI_LABELED_COLD,
      fromEmail: from,
      emailAccountId: emailAccount.id,
      reason: aiReason,
      messageId: email.id,
      threadId: email.threadId,
    },
  });
}
