import type { EmailLabels } from "@/providers/email-label-types";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { isDefined } from "@/utils/types";
import { getRuleLabel } from "@/utils/rule/consts";
import { SystemType } from "@/generated/prisma/enums";

export type EmailMessageCellLabel = {
  id: string;
  name: string;
};

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
      let label = userLabels[idOrName];

      if (!label) {
        const foundLabel = Object.values(userLabels).find(
          (l) => l.name.toLowerCase() === idOrName.toLowerCase(),
        );
        if (foundLabel) {
          label = foundLabel;
        }
      }

      if (!label) return null;
      return { id: label.id, name: label.name };
    })
    .filter(isDefined)
    .filter((label) => {
      if (filterReplyTrackerLabels) {
        if (
          label.name === getRuleLabel(SystemType.TO_REPLY) ||
          label.name === getRuleLabel(SystemType.AWAITING_REPLY)
        ) {
          return false;
        }
      }

      if (label.name.includes("/")) {
        return false;
      }
      return true;
    });

  if (shouldShowArchivedLabel({ labelIds, provider, labels })) {
    labels?.unshift({ id: "ARCHIVE", name: "Archived" });
  }

  return labels;
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
  if (labels?.some((label) => label.id === "ARCHIVE")) return false;

  if (isGoogleProvider(provider)) {
    return !labelIds.includes("INBOX");
  }

  if (isMicrosoftProvider(provider)) {
    return labelIds.includes("ARCHIVE");
  }

  return false;
}
