import type { EmailLabel, EmailLabels } from "@/providers/email-label-types";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { isDefined } from "@/utils/types";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";
import { GMAIL_SYSTEM_LABELS, GmailLabel } from "@/utils/gmail/label";
import { OutlookLabel } from "@/utils/outlook/constants";

export type EmailMessageCellLabel = Pick<EmailLabel, "id" | "name" | "color">;

const TO_REPLY_LABEL = getRuleLabel(SystemType.TO_REPLY);
const AWAITING_REPLY_LABEL = getRuleLabel(SystemType.AWAITING_REPLY);
const GMAIL_CATEGORY_LABELS = new Set(
  GMAIL_SYSTEM_LABELS.filter((label) => label.startsWith("CATEGORY_")),
);

export function getEmailMessageCellLabels({
  labelIds,
  userLabels,
  filterReplyTrackerLabels,
  provider,
}: {
  labelIds?: string[];
  userLabels: EmailLabels;
  filterReplyTrackerLabels?: boolean;
  provider?: string | null;
}): EmailMessageCellLabel[] | undefined {
  const labels = labelIds
    ?.map((idOrName) => {
      const label =
        userLabels[idOrName] ??
        Object.values(userLabels).find(
          (l) => l.name.toLowerCase() === idOrName.toLowerCase(),
        );

      if (!label) return null;
      return { id: label.id, name: label.name, color: label.color };
    })
    .filter(isDefined)
    .filter((label) => {
      if (
        filterReplyTrackerLabels &&
        (label.name === TO_REPLY_LABEL || label.name === AWAITING_REPLY_LABEL)
      ) {
        return false;
      }

      if (label.name.includes("/")) {
        return false;
      }
      return true;
    });

  if (shouldShowArchivedLabel({ labelIds, provider, labels })) {
    labels?.unshift({
      id: OutlookLabel.ARCHIVE,
      name: "Archived",
      color: undefined,
    });
  }

  return labels;
}

export function getEmailThreadLabels({
  messages,
  userLabels,
}: {
  messages: { labelIds?: string[] }[];
  userLabels: EmailLabels;
}): EmailMessageCellLabel[] {
  const labelIds = [
    ...new Set(
      [...messages].reverse().flatMap((message) => message.labelIds ?? []),
    ),
  ].filter((labelId) => !GMAIL_CATEGORY_LABELS.has(labelId));

  return getEmailMessageCellLabels({ labelIds, userLabels }) ?? [];
}

function shouldShowArchivedLabel({
  labelIds,
  provider,
  labels,
}: {
  labelIds?: string[];
  provider?: string | null;
  labels?: EmailMessageCellLabel[];
}) {
  if (!labelIds) return false;
  if (labels?.some((label) => label.id === OutlookLabel.ARCHIVE)) return false;

  if (isGoogleProvider(provider)) {
    return !labelIds.includes(GmailLabel.INBOX);
  }

  if (isMicrosoftProvider(provider)) {
    return labelIds.includes(OutlookLabel.ARCHIVE);
  }

  return false;
}
