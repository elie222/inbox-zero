import { ExecutedRuleStatus, SystemType } from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { checkSenderReplyHistory } from "@/utils/reply-tracker/check-sender-reply-history";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import type { ParsedMessage } from "@/utils/types";

const MODULE = "filter-selectable-rules";

const TO_REPLY_RECEIVED_THRESHOLD = 10;
const NO_REPLY_PREFIXES = [
  "noreply@",
  "no-reply@",
  "notifications@",
  "notif@",
  "info@",
  "newsletter@",
  "updates@",
  "account@",
];

type ConversationStatusCandidate = {
  id: string;
  name: string;
  systemType: SystemType | null;
};

export async function filterConversationStatusRules<
  T extends ConversationStatusCandidate,
>(
  potentialMatches: T[],
  message: ParsedMessage,
  provider: EmailProvider,
  logger: Logger,
): Promise<T[]> {
  const result = await filterConversationStatusRulesWithMetadata(
    potentialMatches,
    message,
    provider,
    logger,
  );

  return result.rules;
}

export async function filterConversationStatusRulesWithMetadata<
  T extends ConversationStatusCandidate,
>(
  potentialMatches: T[],
  message: ParsedMessage,
  provider: EmailProvider,
  logger: Logger,
): Promise<{
  rules: T[];
  filteredRuleNames: string[];
  filterReason?: "no_reply_sender" | "reply_history_threshold";
}> {
  const log = logger.with({ module: MODULE });
  const toReplyRule = potentialMatches.find(
    (r) => r.systemType === SystemType.TO_REPLY,
  );

  if (!toReplyRule) {
    return { rules: potentialMatches, filteredRuleNames: [] };
  }

  const senderEmail = message.headers.from;
  if (!senderEmail) {
    return { rules: potentialMatches, filteredRuleNames: [] };
  }

  const extractedSenderEmail = extractEmailAddress(senderEmail);

  const filteredConversationRuleNames = potentialMatches
    .filter((r) => isConversationStatusType(r.systemType))
    .map((r) => r.name);

  function filteredOutConversationStatusRules() {
    return potentialMatches.filter(
      (r) => !isConversationStatusType(r.systemType),
    );
  }

  if (
    NO_REPLY_PREFIXES.some((prefix) => extractedSenderEmail.startsWith(prefix))
  ) {
    return {
      rules: filteredOutConversationStatusRules(),
      filteredRuleNames: filteredConversationRuleNames,
      filterReason: "no_reply_sender",
    };
  }

  try {
    const { hasReplied, receivedCount } = await checkSenderReplyHistory(
      provider,
      senderEmail,
      TO_REPLY_RECEIVED_THRESHOLD,
    );

    if (!hasReplied && receivedCount >= TO_REPLY_RECEIVED_THRESHOLD) {
      log.info(
        "Filtering out TO_REPLY rule due to no prior reply and high received count",
        {
          ruleId: toReplyRule.id,
          senderEmail,
          receivedCount,
        },
      );
      return {
        rules: filteredOutConversationStatusRules(),
        filteredRuleNames: filteredConversationRuleNames,
        filterReason: "reply_history_threshold",
      };
    }
  } catch (error) {
    log.error("Error checking reply history for TO_REPLY filter", {
      senderEmail,
      error,
    });
  }

  return { rules: potentialMatches, filteredRuleNames: [] };
}

/**
 * Filter system rules: if multiple system rules were matched, only keep the primary one.
 * Always keep all conversation rules (non-system rules).
 */
export function filterMultipleSystemRules<
  T extends { name: string; instructions: string; systemType?: string | null },
>(selectedRules: { rule: T; isPrimary?: boolean }[]): T[] {
  const systemRules = selectedRules.filter((r) => r.rule?.systemType);
  const conversationRules = selectedRules.filter(
    (r) => r.rule && !r.rule?.systemType,
  );

  let filteredSystemRules = systemRules;
  if (systemRules.length > 1) {
    // Only keep the primary system rule
    const primarySystemRule = systemRules.find((r) => r.isPrimary);
    filteredSystemRules = primarySystemRule ? [primarySystemRule] : systemRules;
  }

  return [...filteredSystemRules, ...conversationRules].map((r) => r.rule);
}

/**
 * Gets the IDs of rules that were previously executed in this thread.
 * This allows us to continue applying the same rules to a thread for consistency,
 * even if `runOnThreads` is false.
 */
export async function getPreviouslyExecutedRuleIds({
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}): Promise<Set<string>> {
  const previousRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId,
      status: ExecutedRuleStatus.APPLIED,
      ruleId: { not: null },
    },
    select: { ruleId: true },
    distinct: ["ruleId"],
  });

  return new Set(
    previousRules.map((r) => r.ruleId).filter((id): id is string => !!id),
  );
}
