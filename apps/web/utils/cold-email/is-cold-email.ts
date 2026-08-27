import { z } from "zod";
import { env } from "@/env";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Group, GroupItem, Rule } from "@/generated/prisma/client";
import { GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import {
  extractEmailAddress,
  isSameEmailAddress,
  isSameOrganization,
} from "@/utils/email";
import { hasPriorContactOrAssumeYes } from "@/utils/cold-email/has-prior-contact";

export const COLD_EMAIL_FOLDER_NAME = "Cold Emails";

type ColdEmailBlockerReason =
  | "hasPreviousEmail"
  | "ai"
  | "ai-already-labeled"
  | "excluded";

export type ColdEmailPatternMatch = {
  group: Pick<Group, "id" | "name">;
  groupItem: Pick<GroupItem, "id" | "type" | "value" | "exclude">;
};

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
  coldEmailRule: Pick<Rule, "instructions" | "groupId"> | null;
}): Promise<{
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
  patternMatch?: ColdEmailPatternMatch;
}> {
  const logger = createScopedLogger("ai-cold-email").with({
    emailAccountId: emailAccount.id,
    email: emailAccount.email,
    threadId: email.threadId,
    messageId: email.id,
  });

  logger.info("Checking is cold email");

  if (isSameEmailAddress(email.from, env.RESEND_FROM_EMAIL)) {
    logger.info("Sender is the application notification sender");
    return { isColdEmail: false, reason: "hasPreviousEmail" };
  }

  // Nobody at your own company is a cold emailer. Checked here rather than only at the
  // actions, so a colleague is never labelled or archived either.
  if (isSameOrganization(email.from, emailAccount.email)) {
    logger.info("Sender is internal");
    return { isColdEmail: false, reason: "hasPreviousEmail" };
  }

  // Check if we marked it as a cold email already
  const groupId = coldEmailRule?.groupId;
  let patternMatch:
    | (Pick<GroupItem, "id" | "type" | "value" | "exclude"> & {
        group: Pick<Group, "id" | "name"> | null;
      })
    | null = null;

  if (groupId) {
    const normalizedFrom = extractEmailAddress(email.from) || email.from;
    patternMatch = await prisma.groupItem.findFirst({
      where: {
        groupId,
        type: GroupItemType.FROM,
        value: normalizedFrom,
      },
      select: {
        id: true,
        type: true,
        value: true,
        exclude: true,
        group: { select: { id: true, name: true } },
      },
    });
  }

  if (patternMatch && !patternMatch.exclude) {
    logger.info("Known cold email sender", { from: email.from });
    const { group, ...groupItem } = patternMatch;
    return {
      isColdEmail: true,
      reason: "ai-already-labeled",
      ...(group ? { patternMatch: { group, groupItem } } : {}),
    };
  }

  if (patternMatch?.exclude) {
    logger.info("Sender explicitly excluded from cold email blocker", {
      from: email.from,
    });
    return { isColdEmail: false, reason: "excluded" };
  }

  const hasPreviousEmail = await hasPriorContactOrAssumeYes({
    provider,
    from: extractEmailAddress(email.from) || email.from,
    date: email.date,
    messageId: email.id,
    logger,
  });

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
    promptHardening: { trust: "untrusted", level: "compact" },
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
