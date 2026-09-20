import type { Category } from "@/generated/prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import {
  type DecisionModelConfig,
  type DecisionQuestion,
  runDecisionModel,
} from "./decision-model";

const CATEGORY_KEY_PREFIX = "category_";
const SENDER_KEY_PREFIX = "sender_";
const UNKNOWN_KEY = "unknown";
const MIN_CATEGORY_CONFIDENCE = 0.6;

type CategoryOption = Pick<Category, "name" | "description">;
type SenderInput = {
  emailAddress: string;
  emails: { subject: string; snippet: string }[];
};

export async function decideSenderCategory({
  config,
  emailAccount,
  sender,
  previousEmails,
  categories,
  logger,
}: {
  config: DecisionModelConfig;
  emailAccount: EmailAccountWithAI;
  sender: string;
  previousEmails: { subject: string; snippet: string }[];
  categories: CategoryOption[];
  logger: Logger;
}): Promise<{ category: string; rationale?: string } | null> {
  const result = await decideSenderCategories({
    config,
    emailAccount,
    senders: [{ emailAddress: sender, emails: previousEmails.slice(0, 3) }],
    categories,
    logger,
    label: "Categorize sender",
  });
  const category = result[0]?.category;
  return category
    ? { category, rationale: "Selected by the decision model." }
    : null;
}

export async function decideBulkSenderCategories({
  config,
  emailAccount,
  senders,
  categories,
  logger,
}: {
  config: DecisionModelConfig;
  emailAccount: EmailAccountWithAI;
  senders: SenderInput[];
  categories: CategoryOption[];
  logger: Logger;
}): Promise<{ category?: string; sender: string }[]> {
  return decideSenderCategories({
    config,
    emailAccount,
    senders,
    categories,
    logger,
    label: "Categorize senders bulk",
  });
}

async function decideSenderCategories({
  config,
  emailAccount,
  senders,
  categories,
  logger,
  label,
}: {
  config: DecisionModelConfig;
  emailAccount: EmailAccountWithAI;
  senders: SenderInput[];
  categories: CategoryOption[];
  logger: Logger;
  label: string;
}) {
  const categoryByKey = new Map(
    categories.map((category, index) => [
      `${CATEGORY_KEY_PREFIX}${index}`,
      category,
    ]),
  );
  const criteria = {
    ...Object.fromEntries(
      [...categoryByKey].map(([key, category]) => [
        key,
        `${category.name}: ${category.description}`,
      ]),
    ),
    [UNKNOWN_KEY]:
      "The available evidence is ambiguous, insufficient, or fits multiple categories.",
  };
  const questions: Record<string, DecisionQuestion> = Object.fromEntries(
    senders.map((_sender, index) => [
      `${SENDER_KEY_PREFIX}${index}`,
      {
        type: "choice",
        instructions: {
          question: `Which category best fits \`senders.sender_${index}\`?`,
          accuracy:
            "Accuracy is more important than completeness. Choose unknown when uncertain or when multiple categories fit.",
        },
        criteria,
      },
    ]),
  );

  const response = await runDecisionModel({
    config,
    emailAccount,
    state: {
      accountOwner: {
        email: emailAccount.email,
        about: emailAccount.about || null,
      },
      senders: Object.fromEntries(
        senders.map((sender, index) => [
          `${SENDER_KEY_PREFIX}${index}`,
          {
            emailAddress: sender.emailAddress,
            recentEmails: sender.emails,
          },
        ]),
      ),
    },
    questions,
    label,
    logger,
  });

  return senders.map((sender, index) => {
    const answer = response.answers[`${SENDER_KEY_PREFIX}${index}`];
    if (
      answer?.type !== "choice" ||
      answer.choice === UNKNOWN_KEY ||
      answer.confidence < MIN_CATEGORY_CONFIDENCE
    ) {
      return { sender: sender.emailAddress, category: undefined };
    }

    return {
      sender: sender.emailAddress,
      category: categoryByKey.get(answer.choice)?.name,
    };
  });
}
