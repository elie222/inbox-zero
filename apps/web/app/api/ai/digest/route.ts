import { NextResponse } from "next/server";
import { digestBody } from "./validation";
import { DigestStatus } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { getEmailAccountWithAi } from "@/utils/user/get";
import type { StoredDigestContent } from "@/app/api/resend/digest/validation";
import { withError } from "@/utils/middleware";
import { isAssistantEmail } from "@/utils/assistant/is-assistant-email";
import { env } from "@/env";
import { withQstashOrInternal } from "@/utils/qstash";

export const POST = withError(
  "digest",
  withQstashOrInternal(async (request) => {
    let logger = request.logger;

    try {
      const body = digestBody.parse(await request.json());
      const { emailAccountId, actionId, message } = body;

      logger = logger.with({ emailAccountId, messageId: message.id });

      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) {
        throw new Error("Email account not found");
      }

      // Don't summarize Digest emails (this will actually block all emails that we send, but that's okay)
      if (message.from === env.RESEND_FROM_EMAIL) {
        logger.info("Skipping digest item because it is from us");
        return new NextResponse("OK", { status: 200 });
      }

      const isFromAssistant = isAssistantEmail({
        userEmail: emailAccount.email,
        emailToCheck: message.from,
      });

      if (isFromAssistant) {
        logger.info("Skipping digest item because it is from the assistant");
        return new NextResponse("OK", { status: 200 });
      }

      const ruleName = actionId
        ? await getRuleNameByExecutedAction(actionId)
        : null;

      if (!ruleName) {
        logger.warn("Rule name not found for executed action", { actionId });
        return new NextResponse("OK", { status: 200 });
      }

      const summary = await aiSummarizeEmailForDigest({
        ruleName,
        emailAccount,
        messageToSummarize: {
          ...message,
          to: message.to || "",
        },
      });

      if (!summary?.content) {
        logger.info("Skipping digest item because it is not worth summarizing");
        return new NextResponse("OK", { status: 200 });
      }

      await upsertDigest({
        messageId: message.id || "",
        threadId: message.threadId || "",
        emailAccountId,
        actionId,
        content: summary,
        logger,
      });

      return new NextResponse("OK", { status: 200 });
    } catch (error) {
      logger.error("Failed to process digest", { error });
      return new NextResponse("Internal Server Error", { status: 500 });
    }
  }),
);

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
) {
  return await prisma.digestItem.update({
    where: { id: itemId },
    data: {
      content: contentString,
      ...(actionId && { actionId }),
    },
  });
}

async function createDigestItem({
  digestId,
  messageId,
  threadId,
  contentString,
  actionId,
}: {
  digestId: string;
  messageId: string;
  threadId: string;
  contentString: string;
  actionId?: string;
}) {
  return await prisma.digestItem.upsert({
    where: {
      digestId_threadId_messageId: {
        digestId,
        threadId,
        messageId,
      },
    },
    update: {
      content: contentString,
      ...(actionId && { actionId }),
    },
    create: {
      messageId,
      threadId,
      content: contentString,
      digestId,
      ...(actionId && { actionId }),
    },
  });
}

async function upsertDigest({
  messageId,
  threadId,
  emailAccountId,
  actionId,
  content,
  logger,
}: {
  messageId: string;
  threadId: string;
  emailAccountId: string;
  actionId?: string;
  content: StoredDigestContent;
  logger: Logger;
}) {
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
      await updateDigestItem(existingItem.id, contentString, actionId);
    } else {
      logger.info("Creating new digest item");
      await createDigestItem({
        digestId: digest.id,
        messageId,
        threadId,
        contentString,
        actionId,
      });
    }
  } catch (error) {
    logger.error("Failed to upsert digest", { error });
    throw error;
  }
}

async function getRuleNameByExecutedAction(
  actionId: string,
): Promise<string | undefined> {
  const executedAction = await prisma.executedAction.findUnique({
    where: { id: actionId },
    select: {
      executedRule: {
        select: {
          rule: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!executedAction) {
    throw new Error("Executed action not found");
  }

  return executedAction.executedRule?.rule?.name;
}
