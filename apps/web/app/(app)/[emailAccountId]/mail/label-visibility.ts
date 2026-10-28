import type { MailboxLabelCount } from "@/utils/mail-engine/label-count-targets";
import type { EmailLabel } from "@/providers/email-label-types";
import { labelVisibility } from "@/utils/gmail/constants";

/**
 * Applies Gmail's "In label list" setting to the sidebar. Labels the user chose
 * to hide move to the overflow section rather than disappearing, so there is
 * always a way back to their settings.
 */
export function splitLabelsByListVisibility({
  labels,
  countsById,
}: {
  labels: EmailLabel[];
  countsById: Map<string, MailboxLabelCount>;
}): { visibleLabels: EmailLabel[]; hiddenLabels: EmailLabel[] } {
  const visibleLabels: EmailLabel[] = [];
  const hiddenLabels: EmailLabel[] = [];

  for (const label of labels) {
    if (isVisibleInLabelList(label, countsById)) visibleLabels.push(label);
    else hiddenLabels.push(label);
  }

  return { visibleLabels, hiddenLabels };
}

function isVisibleInLabelList(
  label: EmailLabel,
  countsById: Map<string, MailboxLabelCount>,
) {
  if (label.labelListVisibility === labelVisibility.labelHide) return false;
  if (label.labelListVisibility !== labelVisibility.labelShowIfUnread)
    return true;
  // Counts arrive after first paint and some providers never report them, so an
  // unknown count keeps the label visible rather than stranding it in overflow.
  const count = countsById.get(label.id);
  return !count || count.unread > 0;
}
