import type { EmailLabels } from "@/providers/EmailProvider";
import { SystemType } from "@/generated/prisma/enums";
import { getRuleLabel } from "@/utils/rule/consts";

export type DisplayLabel = {
  id: string;
  name: string;
};

const conversationStatusLabels = [
  getRuleLabel(SystemType.TO_REPLY),
  getRuleLabel(SystemType.AWAITING_REPLY),
  getRuleLabel(SystemType.FYI),
  getRuleLabel(SystemType.ACTIONED),
] as const;

const hiddenReplyTrackerLabels = new Set<string>([
  getRuleLabel(SystemType.TO_REPLY),
  getRuleLabel(SystemType.AWAITING_REPLY),
]);

const conversationStatusLabelSet = new Set<string>(conversationStatusLabels);

export function normalizeDisplayedLabels(
  labels: DisplayLabel[],
  {
    filterReplyTrackerLabels = false,
  }: { filterReplyTrackerLabels?: boolean } = {},
) {
  const visibleLabels = labels.filter((label) => {
    if (filterReplyTrackerLabels && hiddenReplyTrackerLabels.has(label.name)) {
      return false;
    }

    return !label.name.includes("/");
  });

  const selectedConversationStatus = conversationStatusLabels.find((statusLabel) =>
    visibleLabels.some((label) => label.name === statusLabel),
  );

  return visibleLabels.filter(
    (label) =>
      !conversationStatusLabelSet.has(label.name) ||
      label.name === selectedConversationStatus,
  );
}

export function getLabelsToDisplay({
  labelIds,
  userLabels,
  filterReplyTrackerLabels = false,
}: {
  labelIds?: string[];
  userLabels: EmailLabels;
  filterReplyTrackerLabels?: boolean;
}): DisplayLabel[] {
  const labels =
    labelIds
      ?.map((idOrName) => {
        let label = userLabels[idOrName];

        if (!label) {
          label = Object.values(userLabels).find(
            (candidate) =>
              candidate.name.toLowerCase() === idOrName.toLowerCase(),
          );
        }

        if (!label) return null;
        return { id: label.id, name: label.name };
      })
      .filter((label): label is DisplayLabel => Boolean(label)) ?? [];

  if (labelIds && !labelIds.includes("INBOX")) {
    labels.unshift({ id: "ARCHIVE", name: "Archived" });
  }

  return normalizeDisplayedLabels(labels, { filterReplyTrackerLabels });
}
