import { NextResponse } from "next/server";
import { digestBody } from "./validation";
import { DigestStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { RuleName } from "@/utils/rule/consts";
import { getRuleNameByExecutedAction } from "@/utils/actions/rule";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { getEmailAccountWithAi } from "@/utils/user/get";

export async function POST(request: Request) {
  const body = digestBody.parse(await request.json());
  const { emailAccountId, coldEmailId, actionId, message } = body;

  const logger = createScopedLogger("digest").with({
    emailAccountId,
    messageId: message.id,
  });

  try {
    // First, find the oldest unsent digest or create a new one if none exist
    const oldestUnsentDigest = await prisma.digest.findFirst({
      where: {
        emailAccountId,
        status: DigestStatus.PENDING,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const digest =
      oldestUnsentDigest ||
      (await prisma.digest.create({
        data: {
          emailAccountId,
          status: DigestStatus.PENDING,
        },
      }));

    // Then, find or create the DigestItem
    const existingDigestItem = await prisma.digestItem.findFirst({
      where: {
        digestId: digest.id,
        messageId: message.id,
        threadId: message.threadId,
      },
    });

    const emailAccount = await getEmailAccountWithAi({ emailAccountId });

    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    const ruleName =
      (actionId && (await getRuleNameByExecutedAction(actionId))) ||
      RuleName.ColdEmail;
    const summary = await aiSummarizeEmailForDigest({
      ruleName: ruleName,
      emailAccount,
      messageToSummarize: message,
    });

    if (existingDigestItem) {
      logger.info("Updating existing digest");
      await prisma.digestItem.update({
        where: { id: existingDigestItem.id },
        data: {
          content: JSON.stringify(summary),
          ...(actionId ? { actionId: { set: actionId } } : {}),
          ...(coldEmailId ? { coldEmailId: { set: coldEmailId } } : {}),
        },
      });
    } else {
      logger.info("Creating new digest");
      await prisma.digestItem.create({
        data: {
          messageId: message.id,
          threadId: message.threadId,
          content: JSON.stringify(summary),
          digestId: digest.id,
          actionId: actionId,
          coldEmailId: coldEmailId,
        },
      });
    }

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    logger.error("Failed to process digest", { error });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
