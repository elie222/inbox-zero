import type { Rule } from "@/generated/prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { type DecisionModelConfig, runDecisionModel } from "./decision-model";
import { getDecisionEmailState } from "./email-state";

const COLD_EMAIL_KEY = "cold_email";
const MIN_COLD_EMAIL_PROBABILITY = 0.75;

export async function decideColdEmail({
  config,
  email,
  emailAccount,
  coldEmailRule,
  logger,
}: {
  config: DecisionModelConfig;
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  coldEmailRule?: Pick<Rule, "instructions"> | null;
  logger: Logger;
}): Promise<{ coldEmail: boolean; reason: string }> {
  const response = await runDecisionModel({
    config,
    emailAccount,
    state: {
      accountOwner: {
        email: emailAccount.email,
        about: emailAccount.about || null,
      },
      email: getDecisionEmailState(email, 2000),
      coldEmailDefinition:
        coldEmailRule?.instructions?.trim() || DEFAULT_COLD_EMAIL_PROMPT,
    },
    questions: {
      [COLD_EMAIL_KEY]: {
        type: "yesNo",
        instructions:
          "Is `email` cold outreach under `coldEmailDefinition` from the perspective of `accountOwner`?",
        criteria: {
          true: "The message is unsolicited outreach that meets the supplied cold-email definition.",
          false:
            "The message is ordinary marketing, a newsletter, an account message, receipt, alert, calendar invite, or a valuable specific opportunity.",
        },
      },
    },
    label: "Cold email check",
    logger,
  });
  const answer = response.answers[COLD_EMAIL_KEY];
  if (answer?.type !== "yesNo") {
    throw new Error("Decision model response is missing the cold-email answer");
  }

  return {
    coldEmail: answer.probability >= MIN_COLD_EMAIL_PROBABILITY,
    reason: `Decision model cold-email probability: ${answer.probability.toFixed(2)}`,
  };
}
