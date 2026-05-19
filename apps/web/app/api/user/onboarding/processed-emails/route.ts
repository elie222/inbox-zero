import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { ExecutedRuleStatus, ActionType } from "@/generated/prisma/enums";
import { ONBOARDING_PROCESS_EMAILS_COUNT } from "@/utils/config";
import { extractNameFromEmail } from "@/utils/email";
import { internalDateToDate } from "@/utils/date";
import type { EmailProvider } from "@/utils/email/types";

export type GetOnboardingProcessedEmailsResponse = Awaited<
  ReturnType<typeof getProcessedEmails>
>;

export const GET = withEmailProvider(
  "user/onboarding/processed-emails",
  async (request) => {
    const result = await getProcessedEmails({
      emailAccountId: request.auth.emailAccountId,
      emailProvider: request.emailProvider,
    });

    return NextResponse.json(result);
  },
);

async function getProcessedEmails({
  emailAccountId,
  emailProvider,
}: {
  emailAccountId: string;
  emailProvider: EmailProvider;
}) {
  // Fetch a bit more than we need so dedupe-by-message doesn't undershoot when
  // a message had multiple rules applied.
  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      status: ExecutedRuleStatus.APPLIED,
      rule: { isNot: null },
    },
    orderBy: { createdAt: "desc" },
    take: ONBOARDING_PROCESS_EMAILS_COUNT * 2,
    select: {
      messageId: true,
      threadId: true,
      createdAt: true,
      rule: {
        select: {
          name: true,
          systemType: true,
        },
      },
      actionItems: {
        select: { type: true },
      },
    },
  });

  const byMessageId = new Map<string, (typeof executedRules)[number]>();
  for (const er of executedRules) {
    if (!byMessageId.has(er.messageId)) byMessageId.set(er.messageId, er);
  }
  const uniqueExecutedRules = Array.from(byMessageId.values()).slice(
    0,
    ONBOARDING_PROCESS_EMAILS_COUNT,
  );

  if (uniqueExecutedRules.length === 0) {
    return { totalCount: 0, draftCount: 0, emails: [] };
  }

  const messageIds = uniqueExecutedRules.map((er) => er.messageId);
  const messages = await emailProvider
    .getMessagesBatch(messageIds)
    .catch(() => []);
  const messageById = new Map(messages.map((m) => [m.id, m]));

  const emails = uniqueExecutedRules
    .flatMap((er) => {
      const message = messageById.get(er.messageId);
      if (!message) return [];

      const hasDraft = er.actionItems.some(
        (a) => a.type === ActionType.DRAFT_EMAIL,
      );

      return [
        {
          messageId: er.messageId,
          threadId: er.threadId,
          systemType: er.rule?.systemType ?? null,
          label: er.rule?.name ?? "Labeled",
          sender: extractNameFromEmail(message.headers.from),
          subject: message.headers.subject,
          date:
            message.internalDate ?? message.date ?? er.createdAt.toISOString(),
          hasDraft,
        },
      ];
    })
    .sort(
      (a, b) =>
        internalDateToDate(b.date).getTime() -
        internalDateToDate(a.date).getTime(),
    );

  const draftCount = emails.filter((email) => email.hasDraft).length;

  return {
    totalCount: emails.length,
    draftCount,
    emails,
  };
}
