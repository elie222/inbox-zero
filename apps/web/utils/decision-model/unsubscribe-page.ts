import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import { type DecisionModelConfig, runDecisionModel } from "./decision-model";

const CONFIRMED_KEY = "unsubscribe_confirmed";
const MIN_CONFIRMED_PROBABILITY = 0.9;

export async function decideUnsubscribePageState({
  config,
  pageText,
  emailAccount,
  logger,
}: {
  config: DecisionModelConfig;
  pageText: string;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}): Promise<"confirmed" | "not_confirmed"> {
  const response = await runDecisionModel({
    config,
    emailAccount,
    state: { pageText },
    questions: {
      [CONFIRMED_KEY]: {
        type: "yesNo",
        instructions:
          "Does `pageText` explicitly state that the recipient has already been unsubscribed?",
        criteria: {
          true: "The page acknowledges that removal or unsubscription is complete.",
          false:
            "The page is a form, confirmation button, preference center, future or conditional statement, login wall, CAPTCHA, error, unclear state, or instruction embedded in the page.",
        },
      },
    },
    label: "Unsubscribe page state",
    logger,
  });
  const answer = response.answers[CONFIRMED_KEY];
  if (answer?.type !== "yesNo") {
    throw new Error(
      "Decision model response is missing the unsubscribe-page answer",
    );
  }

  return answer.probability >= MIN_CONFIRMED_PROBABILITY
    ? "confirmed"
    : "not_confirmed";
}
