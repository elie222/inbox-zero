import { NextResponse } from "next/server";
import { digestBody } from "./validation";
import { DigestStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { RuleName } from "@/utils/rule/consts";
import { getRuleNameByExecutedAction } from "@/utils/actions/rule";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { DigestEmailSummarySchema } from "@/app/api/resend/digest/validation";

const LOGGER_NAME = "digest";

export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/ai/digest"));
    return new Response("Unauthorized", { status: 401 });
  }

  const logger = createScopedLogger(LOGGER_NAME);

  try {
    const body = digestBody.parse(await request.json());
    const { emailAccountId, coldEmailId, actionId, message } = body;

    logger.with({ emailAccountId, messageId: message.id });

    const emailAccount = await getEmailAccountWithAi({ emailAccountId });
    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    const ruleName = await resolveRuleName(actionId);
    const summary = await aiSummarizeEmailForDigest({
      ruleName,
      emailAccount,
      messageToSummarize: message,
    });

    await upsertDigest({
      messageId: message.id || "",
      threadId: message.threadId || "",
      emailAccountId,
      actionId,
      coldEmailId,
      content: summary,
    });

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    logger.error("Failed to process digest", { error });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}

async function resolveRuleName(actionId?: string): Promise<string> {
  if (!actionId) return RuleName.ColdEmail;

  const ruleName = await getRuleNameByExecutedAction(actionId);
  return ruleName || RuleName.ColdEmail;
}

async function upsertDigest({
  messageId,
  threadId,
  emailAccountId,
  actionId,
  coldEmailId,
  content,
}: {
  messageId: string;
  threadId: string;
  emailAccountId: string;
  actionId?: string;
  coldEmailId?: string;
  content: DigestEmailSummarySchema;
}) {
  const logger = createScopedLogger(LOGGER_NAME).with({
    messageId,
    threadId,
    emailAccountId,
    actionId,
    coldEmailId,
  });

  try {
    const digest = await findOrCreateDigest(
      emailAccountId,
      messageId,
      threadId,
    );
    const existingItem = digest.items[0];
    const contentString = JSON.stringify(content);

    if (existingItem) {
      logger.info("Updating existing digest item");
      await updateDigestItem(
        existingItem.id,
        contentString,
        actionId,
        coldEmailId,
      );
    } else {
      logger.info("Creating new digest item");
      await createDigestItem({
        digestId: digest.id,
        messageId,
        threadId,
        contentString,
        actionId,
        coldEmailId,
      });
    }
  } catch (error) {
    logger.error("Failed to upsert digest", { error });
    throw error;
  }
}

async function findOrCreateDigest(
  emailAccountId: string,
  messageId: string,
  threadId: string,
) {
  const digestWithItem = await prisma.digest.findFirst({
    where: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    orderBy: {
      createdAt: "asc",
    },
    include: {
      items: {
        where: { messageId, threadId },
        take: 1,
      },
    },
  });

  if (digestWithItem) {
    return digestWithItem;
  }

  return await prisma.digest.create({
    data: {
      emailAccountId,
      status: DigestStatus.PENDING,
    },
    include: {
      items: {
        where: { messageId, threadId },
        take: 1,
      },
    },
  });
}

async function updateDigestItem(
  itemId: string,
  contentString: string,
  actionId?: string,
  coldEmailId?: string,
) {
  return await prisma.digestItem.update({
    where: { id: itemId },
    data: {
      content: contentString,
      ...(actionId && { actionId }),
      ...(coldEmailId && { coldEmailId }),
    },
  });
}

async function createDigestItem({
  digestId,
  messageId,
  threadId,
  contentString,
  actionId,
  coldEmailId,
}: {
  digestId: string;
  messageId: string;
  threadId: string;
  contentString: string;
  actionId?: string;
  coldEmailId?: string;
}) {
  return await prisma.digestItem.create({
    data: {
      messageId,
      threadId,
      content: contentString,
      digestId,
      ...(actionId && { actionId }),
      ...(coldEmailId && { coldEmailId }),
    },
  });
}
