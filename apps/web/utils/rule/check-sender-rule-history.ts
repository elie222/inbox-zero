import sumBy from "lodash/sumBy";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/types";
import { extractEmailAddress } from "@/utils/email";
import { ExecutedRuleStatus } from "@/generated/prisma/enums";

export interface SenderRuleHistory {
  totalEmails: number;
  ruleMatches: Map<string, { ruleName: string; count: number }>;
  hasConsistentRule: boolean;
  consistentRuleName?: string;
}

/**
 * Checks the historical rule matches for a specific sender
 * Returns information about which rules have been applied to this sender's emails
 */
export async function checkSenderRuleHistory({
  emailAccountId,
  from,
  provider,
  logger,
}: {
  emailAccountId: string;
  from: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<SenderRuleHistory> {
  logger = logger.with({ emailAccountId, from });
  const senderEmail = extractEmailAddress(from);

  logger.info("Checking sender rule history");

  const { messages } = await provider.getMessagesFromSender({
    senderEmail,
    maxResults: 50,
  });

  logger.info("Found messages from sender", { totalMessages: messages.length });

  if (messages.length === 0) {
    return {
      totalEmails: 0,
      ruleMatches: new Map(),
      hasConsistentRule: false,
    };
  }

  const messageIds = messages.map((message) => message.id);

  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      status: ExecutedRuleStatus.APPLIED,
      messageId: { in: messageIds },
      rule: { enabled: true },
    },
    select: {
      messageId: true,
      threadId: true,
      rule: { select: { id: true, name: true } },
    },
  });

  logger.info("Found executed rules for sender messages", {
    totalExecutedRules: executedRules.length,
  });

  // Process the results
  const ruleMatches = new Map<string, { ruleName: string; count: number }>();
  const processedMessageIds = new Set<string>();

  for (const executedRule of executedRules) {
    if (!executedRule.rule) continue;

    // Avoid double-counting if we match both messageId and threadId for the same message
    const messageKey = executedRule.messageId || executedRule.threadId;
    if (!messageKey || processedMessageIds.has(messageKey)) continue;

    processedMessageIds.add(messageKey);

    const existing = ruleMatches.get(executedRule.rule.id);
    if (existing) {
      existing.count++;
    } else {
      ruleMatches.set(executedRule.rule.id, {
        ruleName: executedRule.rule.name,
        count: 1,
      });
    }
  }

  const totalEmailsFromSender = messages.length;
  const totalRuleMatches = sumBy(
    Array.from(ruleMatches.values()),
    (rule) => rule.count,
  );

  // Check if there's a consistent rule
  let hasConsistentRule = false;
  let consistentRuleName: string | undefined;

  if (totalRuleMatches > 0 && ruleMatches.size === 1) {
    // All rule executions were for the same rule
    const [[, ruleInfo]] = Array.from(ruleMatches.entries());
    hasConsistentRule = true;
    consistentRuleName = ruleInfo.ruleName;
  }

  logger.info("Sender rule history analysis complete", {
    totalEmailsFromSender,
    totalRuleMatches,
    uniqueRulesMatched: ruleMatches.size,
    hasConsistentRule,
    consistentRuleName,
  });

  return {
    totalEmails: totalEmailsFromSender,
    ruleMatches,
    hasConsistentRule,
    consistentRuleName,
  };
}
