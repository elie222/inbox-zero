import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ExecutedRuleStatus,
  LogicalOperator,
  SystemType,
} from "@/generated/prisma/enums";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import { createEmailProvider } from "@/utils/email/provider";
import { notifyMailboxChanged } from "@/utils/mailbox-push";
import { withAuth } from "@/utils/middleware";
import {
  isFakePushTransport,
  takeRecordedPushSends,
} from "@/utils/mobile-push";
import prisma from "@/utils/prisma";
import { sendToReplyPushNotification } from "@/utils/to-reply-push";
import type { ParsedMessage } from "@/utils/types";

const triggerPushSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mailbox"),
    emailAccountId: z.string().min(1),
  }),
  z.object({
    type: z.literal("to_reply"),
    emailAccountId: z.string().min(1),
    messageId: z.string().min(1),
  }),
]);

export type TriggerPushResponse = {
  sends: ReturnType<typeof takeRecordedPushSends>;
};

// Test-only: the provider emulators never deliver push.
export const POST = withAuth("mobile/push/test/trigger", async (request) => {
  if (!isFakePushTransport()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = triggerPushSchema.parse(await request.json());
  const emailAccount = await prisma.emailAccount.findFirst({
    where: { id: body.emailAccountId, userId: request.auth.userId },
    select: { id: true, account: { select: { provider: true } } },
  });
  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  takeRecordedPushSends();

  if (body.type === "mailbox") {
    await notifyMailboxChanged({
      emailAccountId: emailAccount.id,
      logger: request.logger,
    });
  } else {
    const provider = await createEmailProvider({
      emailAccountId: emailAccount.id,
      provider: emailAccount.account.provider,
      logger: request.logger,
    });
    let message: ParsedMessage;
    try {
      message = await provider.getMessage(body.messageId);
    } catch {
      return NextResponse.json({ error: "Message not found" }, { status: 404 });
    }
    await sendToReplyPushNotification({
      emailAccountId: emailAccount.id,
      userId: request.auth.userId,
      message,
      results: [
        {
          rule: {
            id: "push-test-trigger",
            name: "To Reply",
            systemType: SystemType.TO_REPLY,
            instructions: null,
            groupId: null,
            from: null,
            to: null,
            subject: null,
            body: null,
            conditionalOperator: LogicalOperator.AND,
          },
          status: ExecutedRuleStatus.APPLIED,
          createdAt: new Date(),
        },
      ],
      logger: request.logger,
      // Seeded mail is older than the alert window.
      now: new Date(getMessageTimestamp(message)),
    });
  }

  return NextResponse.json({
    sends: takeRecordedPushSends(),
  } satisfies TriggerPushResponse);
});
