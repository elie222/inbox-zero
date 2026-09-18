import { z } from "zod";
import { env } from "@/env";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Group, GroupItem, Rule } from "@/generated/prisma/client";
import { GroupItemType } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { stringifyEmail } from "@/utils/stringify-email";
import type { Logger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import type { EmailProvider } from "@/utils/email/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { extractEmailAddress, isSameOrganization } from "@/utils/email";
import { isWhitelistedSender } from "@/utils/email/whitelist";
import { hasPriorContactOrAssumeYes } from "@/utils/cold-email/has-prior-contact";

export const COLD_EMAIL_FOLDER_NAME = "Cold Emails";

type ColdEmailBlockerReason =
  | "hasPreviousEmail"
  | "applicationSender"
  | "ai"
  | "ai-already-labeled"
  | "excluded";

export type ColdEmailPatternMatch = {
  group: Pick<Group, "id" | "name">;
  groupItem: Pick<GroupItem, "id" | "type" | "value" | "exclude">;
};

type ColdEmailResult = {
  isColdEmail: boolean;
  reason: ColdEmailBlockerReason;
  aiReason?: string | null;
  patternMatch?: ColdEmailPatternMatch;
};

type ColdEmailGuardsInput = {
  email: EmailForLLM & { threadId?: string };
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  coldEmailRule: Pick<Rule, "instructions" | "groupId"> | null;
  logger: Logger;
};

/**
 * Runs the deterministic cold-email checks (whitelist, same org, learned
 * patterns, prior contact). Returns null when only the AI check remains, so a
 * caller can run that check itself.
 */
export async function checkColdEmailGuards({
  email,
  emailAccount,
  provider,
  coldEmailRule,
  logger,
}: ColdEmailGuardsInput): Promise<ColdEmailResult | null> {
  logger.info("Checking is cold email");

  if (
    isWhitelistedSender(email.from, env.RESEND_FROM_EMAIL) ||
    isWhitelistedSender(email.from, env.WHITELIST_FROM)
  ) {
    logger.info("Sender is an application sender");
    return { isColdEmail: false, reason: "applicationSender" };
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

  return null;
}

export async function isColdEmail({
  email,
  emailAccount,
  provider,
  modelType,
  coldEmailRule,
  logger,
}: ColdEmailGuardsInput & {
  modelType?: ModelType;
}): Promise<ColdEmailResult> {
  const guardResult = await checkColdEmailGuards({
    email,
    emailAccount,
    provider,
    coldEmailRule,
    logger,
  });

  if (guardResult) return guardResult;

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
  const system = `Decide whether the email is cold outreach. Give a concise reason.

<instructions>
${coldEmailPrompt || DEFAULT_COLD_EMAIL_PROMPT}
</instructions>`;

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
    instructions: system,
    prompt,
    schema: z.object({
      coldEmail: z.boolean(),
      reason: z.string(),
    }),
  });

  return response.object;
}
