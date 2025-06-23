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

export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/ai/digest"));
    return new Response("Unauthorized", { status: 401 });
  }
  const body = digestBody.parse(await request.json());
  const { emailAccountId, coldEmailId, actionId, message } = body;

  const logger = createScopedLogger("digest").with({
    emailAccountId,
    messageId: message.id,
  });

  try {
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

    await upsertDigest({
      messageId: message.id || "",
      threadId: message.threadId || "",
      emailAccountId,
      actionId: actionId === undefined ? undefined : actionId,
      coldEmailId: coldEmailId === undefined ? undefined : coldEmailId,
      content: summary,
    });

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    logger.error("Failed to process digest", { error });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
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
  const logger = createScopedLogger("upsert-digest").with({
    messageId,
    threadId,
    emailAccountId,
    actionId,
    coldEmailId,
  });

  try {
    // Find or create the digest atomically with digestItems included
    const digest =
      (await prisma.digest.findFirst({
        where: {
          emailAccountId,
          status: DigestStatus.PENDING,
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          items: {
            where: {
              messageId,
              threadId,
            },
            take: 1,
          },
        },
      })) ||
      (await prisma.digest.create({
        data: {
          emailAccountId,
          status: DigestStatus.PENDING,
        },
        include: {
          items: {
            where: {
              messageId,
              threadId,
            },
            take: 1,
          },
        },
      }));

    const digestItem = digest.items.length > 0 ? digest.items[0] : null;
    const contentString = JSON.stringify(content);

    if (digestItem) {
      logger.info("Updating existing digest");
      await prisma.digestItem.update({
        where: { id: digestItem.id },
        data: {
          content: contentString,
          ...(actionId ? { actionId } : {}),
          ...(coldEmailId ? { coldEmailId } : {}),
        },
      });
    } else {
      logger.info("Creating new digest");
      await prisma.digestItem.create({
        data: {
          messageId,
          threadId,
          content: contentString,
          digestId: digest.id,
          ...(actionId ? { actionId } : {}),
          ...(coldEmailId ? { coldEmailId } : {}),
        },
      });
    }
  } catch (error) {
    logger.error("Failed to upsert digest", { error });
    throw error;
  }
}
