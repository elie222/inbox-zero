import { NextResponse, after } from "next/server";
import { headers } from "next/headers";
import type { gmail_v1 } from "@googleapis/gmail";
import { z } from "zod";
import { getGmailClient } from "@/utils/gmail/client";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { aiDetectRecurringPattern } from "@/utils/ai/choose-rule/ai-detect-recurring-pattern";
import type { EmailForLLM } from "@/utils/types";
import { parseMessage } from "@/utils/mail";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { internalDateToDate } from "@/utils/date";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { GroupItemType } from "@prisma/client";

export const maxDuration = 60;

const THRESHOLD_EMAILS = 3;
const MAX_RESULTS = 20;

const logger = createScopedLogger("api/ai/pattern-match");

const schema = z.object({
  userId: z.string(),
  from: z.string().email("Invalid sender email"),
});
export type AnalyzeSenderPatternBody = z.infer<typeof schema>;

async function process(request: Request) {
  if (!isValidInternalApiKey(await headers())) {
    logger.error("Invalid API key");
    return NextResponse.json({ error: "Invalid API key" });
  }

  const json = await request.json();
  const { userId, from } = schema.parse(json);

  try {
    const user = await getUserWithRules(userId);

    if (!user) {
      logger.error("User not found", { userId });
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const account = user.accounts[0];

    if (!account.access_token || !account.refresh_token) {
      logger.error("No Gmail account found", { userId });
      return NextResponse.json(
        { error: "No Gmail account found" },
        { status: 404 },
      );
    }

    const gmail = getGmailClient({
      accessToken: account.access_token,
      refreshToken: account.refresh_token,
    });

    const emails = await getMessagesFromSender(gmail, from, MAX_RESULTS);

    // If not enough emails, return null result
    if (emails.length < THRESHOLD_EMAILS) {
      return NextResponse.json({
        result: null,
        reason: "Not enough emails found from this sender",
      });
    }

    // Detect pattern
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
      await saveToDb({
        userId,
        from,
        ruleName: patternResult.matchedRule,
      });
    }

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

export const POST = withError(async (request) => {
  // return immediately and process in background
  after(() => process(request));
  return NextResponse.json({ processing: true });
});

async function saveToDb({
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
    select: { groupId: true },
  });

  if (!rule) {
    logger.error("Rule not found", { userId, ruleName });
    return;
  }
  if (!rule.groupId) {
    logger.error("Rule has no group", { userId, ruleName });
    return;
  }

  await prisma.groupItem.upsert({
    where: {
      groupId_type_value: {
        groupId: rule.groupId,
        type: GroupItemType.FROM,
        value: from,
      },
    },
    update: {},
    create: {
      groupId: rule.groupId,
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

// TODO: fix this nonsense up. we have similar functions in other files
// see smart categories for this
async function getMessagesFromSender(
  gmail: gmail_v1.Gmail,
  sender: string,
  maxResults = 5,
): Promise<EmailForLLM[]> {
  try {
    // Query Gmail API for messages from the specific sender
    const response = await getMessages(gmail, {
      query: `from:${sender} -label:draft`,
      maxResults,
    });

    // If no messages found, return empty array
    if (!response.messages || response.messages.length === 0) {
      return [];
    }

    // Fetch full message details for each message
    const messages = await Promise.all(
      response.messages.map(async (message) => {
        if (!message.id) return null;
        const fullMessage = await getMessage(message.id, gmail, "full");
        return parseMessage(fullMessage);
      }),
    );

    // Filter out any null messages and convert to EmailForLLM format
    return messages
      .filter(
        (message): message is NonNullable<typeof message> => message !== null,
      )
      .map((message) => ({
        id: message.id,
        from: message.headers.from,
        subject: message.headers.subject,
        content: message.textPlain || message.textHtml || "",
        date: internalDateToDate(message.internalDate),
      }));
  } catch (error) {
    logger.error("Error fetching emails from sender", { sender, error });
    return [];
  }
}
