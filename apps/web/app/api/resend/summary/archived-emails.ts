import type { Prisma } from "@/generated/prisma/client";
import {
  ActionType,
  ExecutedRuleStatus,
  ScheduledActionStatus,
  type SystemType,
} from "@/generated/prisma/enums";
import { shouldSkipAutomatedArchiveForSender } from "@/utils/ai/automated-archive-exception";
import { decodeSnippet } from "@/utils/gmail/decode";
import { getRuleName } from "@/utils/rule/consts";
import type { ParsedMessage } from "@/utils/types";

export const ARCHIVED_EMAIL_DISPLAY_LIMIT = 100;

export type ArchivedEmailSummaryItem = {
  from: string;
  ruleName: string;
  sentAt: Date;
  subject: string;
};

type ArchivedActionSummary = {
  createdAt: Date;
  executedRule: {
    messageId: string;
    rule: { name: string; systemType: SystemType | null } | null;
  };
};

export function getArchivedActionWhere({
  emailAccountId,
  cutOffDate,
}: {
  emailAccountId: string;
  cutOffDate: Date;
}) {
  return {
    type: ActionType.ARCHIVE,
    createdAt: { gt: cutOffDate },
    executedRule: {
      emailAccountId,
      automated: true,
    },
    OR: [
      {
        scheduledAction: {
          is: { status: ScheduledActionStatus.COMPLETED },
        },
      },
      {
        scheduledAction: { is: null },
        executedRule: { status: ExecutedRuleStatus.APPLIED },
      },
    ],
  } satisfies Prisma.ExecutedActionWhereInput;
}

export function buildArchivedEmailSummaryItems({
  archivedActions,
  messageMap,
}: {
  archivedActions: ArchivedActionSummary[];
  messageMap: Record<string, ParsedMessage | undefined>;
}): ArchivedEmailSummaryItem[] {
  return archivedActions.flatMap((action) => {
    const message = messageMap[action.executedRule.messageId];
    if (!message) return [];

    if (
      shouldSkipAutomatedArchiveForSender({
        actionType: ActionType.ARCHIVE,
        from: message.headers.from,
      })
    ) {
      return [];
    }

    return {
      from: message.headers.from || "Unknown",
      subject: message.headers.subject || decodeSnippet(message.snippet) || "",
      sentAt: action.createdAt,
      ruleName: getArchivedRuleName(action.executedRule.rule),
    };
  });
}

function getArchivedRuleName(
  rule: { name: string; systemType: SystemType | null } | null,
) {
  if (!rule) return "Automation rule";
  return (
    rule.name ||
    (rule.systemType ? getRuleName(rule.systemType) : "Automation rule")
  );
}
