import { TypeSafeClient, choice } from "@typesafe-ai/sdk";
import { env } from "@/env";
import type { EmailProvider } from "@/utils/email/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { sortByInternalDate } from "@/utils/date";
import { buildThreadStatusMessagesForLLM } from "@/utils/reply-tracker/thread-status-context";

const MODULE = "jev-choose-rule";

const COLD_EMAIL_KEY = "Cold Email";
const NONE_KEY = "None";
const NONE_DEFINITION = "None of the rules apply to this email";
const QUESTION =
  "Which rule best describes this email thread, from the point of view of the account owner?";

const JEV_TIMEOUT_MS = 60_000;
const JEV_MAX_RETRIES = 3;

let client: TypeSafeClient | null = null;

function getClient() {
  if (!client) {
    client = new TypeSafeClient({
      apiKey: env.TYPESAFE_API_KEY,
      timeout: JEV_TIMEOUT_MS,
      retry: { maxRetries: JEV_MAX_RETRIES },
    });
  }
  return client;
}

export function isJevRuleSelectionEnabled() {
  return !!env.JEV_RULE_SELECTION_ENABLED && !!env.TYPESAFE_API_KEY;
}

type JevRuleCandidate = {
  id: string;
  name: string;
  instructions: string;
  systemType?: string | null;
};

export async function jevChooseRule<T extends JevRuleCandidate>({
  message,
  provider,
  emailAccount,
  rules,
  coldEmailOption,
  logger: parentLogger,
}: {
  message: ParsedMessage;
  provider: EmailProvider;
  emailAccount: EmailAccountWithAI;
  rules: T[];
  coldEmailOption: { instructions: string } | null;
  logger: Logger;
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
  isColdEmail: boolean;
}> {
  const logger = parentLogger.with({ module: MODULE });

  const state = await buildState({ message, provider, emailAccount, logger });
  const { criteria, rulesByKey } = buildCriteria({ rules, coldEmailOption });

  let answer: {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  let model: string;
  let inputTokens: number;

  try {
    const res = await getClient().systemOne({
      state,
      questions: { label: choice(QUESTION, criteria) },
    });
    answer = res.answers.label;
    model = res.model;
    inputTokens = res.usage.input_tokens;
  } catch (error) {
    logger.error("Jev request failed", { error });
    throw new Error(
      `Jev rule selection failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  logger.info("Jev chose rule", {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    model,
    inputTokens,
  });

  const reason = `Jev chose "${answer.choice}" (confidence ${answer.confidence.toFixed(2)})`;

  if (answer.choice === NONE_KEY)
    return { rules: [], reason, isColdEmail: false };
  if (answer.choice === COLD_EMAIL_KEY) {
    return { rules: [], reason, isColdEmail: true };
  }

  const rule = rulesByKey.get(answer.choice);
  if (!rule) {
    logger.warn("Jev returned an unknown key", { choice: answer.choice });
    return { rules: [], reason, isColdEmail: false };
  }

  return { rules: [{ rule, isPrimary: true }], reason, isColdEmail: false };
}

function buildCriteria<T extends JevRuleCandidate>({
  rules,
  coldEmailOption,
}: {
  rules: T[];
  coldEmailOption: { instructions: string } | null;
}) {
  const criteria: Record<string, string> = {};
  const rulesByKey = new Map<string, T>();
  const usedKeys = new Set<string>([
    NONE_KEY.toLowerCase(),
    COLD_EMAIL_KEY.toLowerCase(),
  ]);

  for (const rule of rules) {
    const baseKey = rule.name.trim() || rule.id;
    let key = baseKey;
    for (let n = 2; usedKeys.has(key.toLowerCase()); n++) {
      key = `${baseKey} (${n})`;
    }
    usedKeys.add(key.toLowerCase());
    criteria[key] = rule.instructions?.trim() || rule.name;
    rulesByKey.set(key, rule);
  }

  if (coldEmailOption) criteria[COLD_EMAIL_KEY] = coldEmailOption.instructions;
  criteria[NONE_KEY] = NONE_DEFINITION;

  return { criteria, rulesByKey };
}

async function buildState({
  message,
  provider,
  emailAccount,
  logger,
}: {
  message: ParsedMessage;
  provider: EmailProvider;
  emailAccount: EmailAccountWithAI;
  logger: Logger;
}) {
  const sortedMessages = await getThreadMessages({ message, provider, logger });
  const emails = buildThreadStatusMessagesForLLM(sortedMessages);

  const messages = emails.map((email, index) => {
    const original = sortedMessages[index];
    return {
      from: original && provider.isSentMessage(original) ? "me" : email.from,
      to: email.to,
      subject: email.subject,
      content: email.content,
    };
  });

  const lastMessage = sortedMessages[sortedMessages.length - 1];

  return {
    myEmailAddress: emailAccount.email,
    iSentTheLastMessage: lastMessage
      ? provider.isSentMessage(lastMessage)
      : false,
    messages,
  };
}

async function getThreadMessages({
  message,
  provider,
  logger,
}: {
  message: ParsedMessage;
  provider: EmailProvider;
  logger: Logger;
}): Promise<ParsedMessage[]> {
  if (!provider.isReplyInThread(message)) return [message];

  try {
    const threadMessages = await provider.getThreadMessages(message.threadId);
    const sorted = [...threadMessages].sort(sortByInternalDate());
    if (!sorted.some((m) => m.id === message.id)) sorted.push(message);
    return sorted;
  } catch (error) {
    logger.warn("Failed to fetch thread messages, using single message", {
      error,
    });
    return [message];
  }
}
