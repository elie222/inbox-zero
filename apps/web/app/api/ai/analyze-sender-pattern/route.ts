import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import type { gmail_v1 } from "@googleapis/gmail";
import { z } from "zod";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { aiDetectRecurringPattern } from "@/utils/ai/choose-rule/ai-detect-recurring-pattern";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { GroupItemType } from "@prisma/client";
import { getThreadMessages, getThreads } from "@/utils/gmail/thread";
import { extractEmailAddress } from "@/utils/email";
import { getEmailForLLM } from "@/utils/get-email-from-message";

export const maxDuration = 60;

const THRESHOLD_EMAILS = 3;
const MAX_RESULTS = 10;

const logger = createScopedLogger("api/ai/pattern-match");

const schema = z.object({
  userId: z.string(),
  from: z.string(),
});
export type AnalyzeSenderPatternBody = z.infer<typeof schema>;

export const POST = withError(async (request) => {
  if (!isValidInternalApiKey(await headers())) {
    logger.error("Invalid API key");
    return NextResponse.json({ error: "Invalid API key" });
  }

  const json = await request.json();
  const data = schema.parse(json);
  const { userId } = data;
  const from = extractEmailAddress(data.from);

  logger.trace("Analyzing sender pattern", { userId, from });

  // return immediately and process in background
  after(() => process({ userId, from }));
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
async function process({ userId, from }: { userId: string; from: string }) {
  try {
    // Check if we've already analyzed this sender
    const existingCheck = await prisma.newsletter.findUnique({
      where: { email_userId: { email: extractEmailAddress(from), userId } },
    });

    if (existingCheck?.patternAnalyzed) {
      logger.info("Sender has already been analyzed", { from, userId });
      return NextResponse.json({ success: true });
    }

    const user = await getUserWithRules(userId);

    if (!user) {
      logger.error("User not found", { userId });
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const account = user.accounts[0];

    if (!account.access_token || !account.refresh_token) {
      logger.error("No Gmail account found", { userId });
      return NextResponse.json({ success: false }, { status: 404 });
    }

    const gmail = getGmailClient({
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
    });

    // Get threads from this sender
    const threadsWithMessages = await getThreadsFromSender(
      gmail,
      from,
      MAX_RESULTS,
    );

    // If no threads found or we've detected a conversation, return early
    if (threadsWithMessages.length === 0) {
      logger.info("No threads found from this sender", {
        from,
        userId,
      });

      // Don't record a check since we didn't run the AI analysis
      return NextResponse.json({ success: true });
    }

    // Get all messages and check if we have enough for pattern detection
    const allMessages = threadsWithMessages.flatMap(
      (thread) => thread.messages,
    );

    if (allMessages.length < THRESHOLD_EMAILS) {
      logger.info("Not enough emails found from this sender", {
        from,
        userId,
        count: allMessages.length,
      });

      // Don't record a check since we didn't run the AI analysis
      return NextResponse.json({ success: true });
    }

    // Convert messages to EmailForLLM format
    const emails = allMessages.map((message) => getEmailForLLM(message));

    // Detect pattern using AI
    const patternResult = await aiDetectRecurringPattern({
      emails,
      user: {
        id: user.id,
        email: user.email || "",
        about: user.about,
        aiProvider: user.aiProvider,
        aiModel: user.aiModel,
        aiApiKey: user.aiApiKey,
      },
      rules: user.rules.map((rule) => ({
        name: rule.name,
        instructions: rule.instructions || "",
      })),
    });

    if (patternResult?.matchedRule) {
      // Save pattern to DB (adds sender to rule's group)
      await saveLearnedPattern({
        userId,
        from,
        ruleName: patternResult.matchedRule,
      });
    }

    // Record the pattern analysis result
    await savePatternCheck(userId, from);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error in pattern match API", {
      from,
      userId,
      error,
    });

    return NextResponse.json(
      { error: "Failed to detect pattern" },
      { status: 500 },
    );
  }
}

/**
 * Record that we've analyzed a sender for patterns
 */
async function savePatternCheck(userId: string, from: string) {
  await prisma.newsletter.upsert({
    where: {
      email_userId: {
        email: from,
        userId,
      },
    },
    update: {
      patternAnalyzed: true,
      lastAnalyzedAt: new Date(),
    },
    create: {
      email: from,
      userId,
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
  gmail: gmail_v1.Gmail,
  sender: string,
  maxResults: number,
) {
  const from = extractEmailAddress(sender);
  const threads = await getThreads(
    `from:${from} -label:sent -label:draft`,
    [],
    gmail,
    maxResults,
  );

  const threadsWithMessages = [];

  // Check for conversation threads
  for (const thread of threads.threads) {
    const messages = await getThreadMessages(thread.id, gmail);

    // Check if this is a conversation (multiple senders)
    const senders = messages.map((msg) =>
      extractEmailAddress(msg.headers.from),
    );
    const hasOtherSenders = senders.some((s) => s !== from);

    // If we found a conversation thread, skip this sender entirely
    if (hasOtherSenders) {
      logger.info("Skipping sender pattern detection - conversation detected", {
        from,
      });
      return [];
    }

    threadsWithMessages.push({
      threadId: thread.id,
      messages,
    });
  }

  return threadsWithMessages;
}

async function saveLearnedPattern({
  userId,
  from,
  ruleName,
}: {
  userId: string;
  from: string;
  ruleName: string;
}) {
  const rule = await prisma.rule.findUnique({
    where: {
      name_userId: {
        name: ruleName,
        userId,
      },
    },
    select: { id: true, groupId: true },
  });

  if (!rule) {
    logger.error("Rule not found", { userId, ruleName });
    return;
  }

  let groupId = rule.groupId;

  if (!groupId) {
    // Create a new group for this rule if one doesn't exist
    const newGroup = await prisma.group.create({
      data: {
        userId,
        name: ruleName,
        rule: { connect: { id: rule.id } },
      },
    });

    groupId = newGroup.id;
  }

  await prisma.groupItem.upsert({
    where: {
      groupId_type_value: {
        groupId,
        type: GroupItemType.FROM,
        value: from,
      },
    },
    update: {},
    create: {
      groupId,
      type: GroupItemType.FROM,
      value: from,
    },
  });
}

async function getUserWithRules(userId: string) {
  return await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      about: true,
      aiProvider: true,
      aiModel: true,
      aiApiKey: true,
      accounts: {
        take: 1,
        select: {
          access_token: true,
          refresh_token: true,
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
