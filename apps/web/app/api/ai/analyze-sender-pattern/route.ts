import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger, type Logger } from "@/utils/logger";
import type { ParsedMessage } from "@/utils/types";
import { aiDetectRecurringPattern } from "@/utils/ai/choose-rule/ai-detect-recurring-pattern";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { extractEmailAddress } from "@/utils/email";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { checkSenderRuleHistory } from "@/utils/rule/check-sender-rule-history";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";

export const maxDuration = 60;

const THRESHOLD_THREADS = 3;
const MAX_RESULTS = 10;

const schema = z.object({
  emailAccountId: z.string(),
  from: z.string(),
});
export type AnalyzeSenderPatternBody = z.infer<typeof schema>;

export const POST = withError(async (request) => {
  const json = await request.json();

  let logger = createScopedLogger("api/ai/pattern-match");

  if (!isValidInternalApiKey(await headers(), logger)) {
    logger.error("Invalid API key for sender pattern analysis", json);
    return NextResponse.json({ error: "Invalid API key" });
  }

  const data = schema.parse(json);
  const { emailAccountId } = data;
  const from = extractEmailAddress(data.from);

  logger = logger.with({ emailAccountId, from });

  logger.trace("Analyzing sender pattern");

  // return immediately and process in background
  after(() => process({ emailAccountId, from, logger }));
  return NextResponse.json({ processing: true });
});

/**
 * Main background process function that:
 * 1. Checks if sender has been analyzed before
 * 2. Gets threads from the sender
 * 3. Analyzes whether threads are one-way communications
 * 4. Detects patterns using AI
 * 5. Stores patterns in DB for future categorization
 */
async function process({
  emailAccountId,
  from,
  logger,
}: {
  emailAccountId: string;
  from: string;
  logger: Logger;
}) {
  try {
    const emailAccount = await getEmailAccountWithRules({ emailAccountId });

    if (!emailAccount) {
      logger.error("Email account not found");
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const existingCheck = await prisma.newsletter.findUnique({
      where: {
        email_emailAccountId: {
          email: extractEmailAddress(from),
          emailAccountId: emailAccount.id,
        },
      },
    });

    if (existingCheck?.patternAnalyzed) {
      logger.info("Sender has already been analyzed");
      return NextResponse.json({ success: true });
    }

    const account = emailAccount.account;

    if (!account?.provider) {
      logger.error("No email provider found");
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const provider = await createEmailProvider({
      emailAccountId,
      provider: account.provider,
    });

    const { threads: threadsWithMessages, conversationDetected } =
      await getThreadsFromSender(provider, from, MAX_RESULTS, logger);

    // If no threads found or we've detected a conversation, return early
    if (conversationDetected) {
      logger.info("Skipping sender pattern detection - conversation detected", {
        provider: account.provider,
      });

      return NextResponse.json({ success: true });
    }

    if (threadsWithMessages.length === 0) {
      logger.error("No threads found from this sender", {
        provider: account.provider,
      });

      // Don't record a check since we didn't run the AI analysis
      return NextResponse.json({ success: true });
    }

    if (threadsWithMessages.length < THRESHOLD_THREADS) {
      logger.info("Not enough emails found from this sender", {
        threadsWithMessagesCount: threadsWithMessages.length,
      });

      return NextResponse.json({ success: true });
    }

    const allMessages = threadsWithMessages.flatMap(
      (thread) => thread.messages,
    );

    const senderHistory = await checkSenderRuleHistory({
      emailAccountId,
      from,
      provider,
    });

    if (!senderHistory.hasConsistentRule) {
      logger.info("Sender does not have consistent rule history", {
        totalEmails: senderHistory.totalEmails,
        uniqueRulesMatched: senderHistory.ruleMatches.size,
      });

      if (senderHistory.totalEmails > 0) {
        await savePatternCheck({ emailAccountId, from });
      }

      return NextResponse.json({ success: true });
    }

    logger.info("Sender has consistent rule history", {
      consistentRule: senderHistory.consistentRuleName,
      totalEmails: senderHistory.totalEmails,
    });

    const emails = allMessages.map((message) => getEmailForLLM(message));

    const patternResult = await aiDetectRecurringPattern({
      emails,
      emailAccount,
      rules: emailAccount.rules.map((rule) => ({
        name: rule.name,
        instructions: rule.instructions || "",
      })),
      consistentRuleName: senderHistory.consistentRuleName,
    });

    if (patternResult?.matchedRule) {
      // Verify the AI matched the same rule as the historical data
      if (patternResult.matchedRule === senderHistory.consistentRuleName) {
        await saveLearnedPattern({
          emailAccountId,
          from,
          ruleName: patternResult.matchedRule,
        });
      } else {
        logger.warn("AI suggested different rule than historical data", {
          aiRule: patternResult.matchedRule,
          historicalRule: senderHistory.consistentRuleName,
        });
      }
    }

    await savePatternCheck({ emailAccountId, from });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error in pattern match API", { error });

    return NextResponse.json(
      { error: "Failed to detect pattern" },
      { status: 500 },
    );
  }
}

/**
 * Record that we've analyzed a sender for patterns
 */
async function savePatternCheck({
  emailAccountId,
  from,
}: {
  emailAccountId: string;
  from: string;
}) {
  await prisma.newsletter.upsert({
    where: {
      email_emailAccountId: {
        email: from,
        emailAccountId,
      },
    },
    update: {
      patternAnalyzed: true,
      lastAnalyzedAt: new Date(),
    },
    create: {
      email: from,
      emailAccountId,
      patternAnalyzed: true,
      lastAnalyzedAt: new Date(),
    },
  });
}

/**
 * Fetches threads from a specific sender and filters out any threads that are conversations.
 * A thread is considered a conversation if it contains messages from senders other than the original sender.
 * This helps identify one-way communication patterns (newsletters, marketing, transactional emails)
 * by excluding threads where users have replied or others have participated.
 */
async function getThreadsFromSender(
  provider: EmailProvider,
  sender: string,
  maxResults: number,
  logger: Logger,
): Promise<{
  threads: Array<{
    threadId: string;
    messages: ParsedMessage[];
  }>;
  conversationDetected: boolean;
}> {
  const from = extractEmailAddress(sender);

  if (!from) {
    logger.error("Unable to analyze sender pattern - from address missing", {
      from: sender,
    });
    return {
      threads: [],
      conversationDetected: false,
    };
  }

  const { threads } = await provider.getThreadsWithQuery({
    query: { fromEmail: from, type: "all" },
    maxResults,
  });

  const threadsWithMessages = [];
  const normalizedFrom = from.toLowerCase();

  // Check for conversation threads
  for (const thread of threads) {
    try {
      const messages = await provider.getThreadMessages(thread.id);
      if (messages.length === 0) continue;

      // Check if this is a conversation (multiple senders)
      const otherSenders = new Set<string>();

      for (const message of messages) {
        const senderEmail = extractEmailAddress(message.headers.from);
        if (!senderEmail) continue;

        const normalizedSender = senderEmail.toLowerCase();
        if (normalizedSender !== normalizedFrom) {
          otherSenders.add(normalizedSender);
        }
      }

      // If we found a conversation thread, skip this sender entirely
      if (otherSenders.size > 0) {
        return {
          threads: [],
          conversationDetected: true,
        };
      }

      threadsWithMessages.push({
        threadId: thread.id,
        messages,
      });
    } catch (error) {
      logger.error("Failed to fetch thread messages for sender analysis", {
        threadId: thread.id,
        error,
      });
    }
  }

  return {
    threads: threadsWithMessages,
    conversationDetected: false,
  };
}

async function getEmailAccountWithRules({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  return await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      id: true,
      userId: true,
      email: true,
      about: true,
      multiRuleSelectionEnabled: true,
      user: {
        select: {
          aiProvider: true,
          aiModel: true,
          aiApiKey: true,
        },
      },
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
      rules: {
        where: { enabled: true, instructions: { not: null } },
        select: {
          id: true,
          name: true,
          instructions: true,
        },
      },
    },
  });
}
