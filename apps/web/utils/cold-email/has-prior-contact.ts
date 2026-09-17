import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { ColdEmailRule } from "@/utils/cold-email/cold-email-rule";

/**
 * Whether the user has corresponded with this sender before, assuming yes whenever we
 * cannot tell.
 *
 * Blocking a sender is compounding: it labels, archives, and on many accounts emails
 * them to say their message was unsolicited. Letting a cold email through costs one
 * email in the inbox. So a missing date, an unreadable message, or a provider outage
 * must all resolve toward leaving the sender alone rather than toward blocking them.
 */
export async function hasPriorContactOrAssumeYes({
  provider,
  from,
  date,
  messageId,
  logger,
  coldEmailActions,
}: {
  provider: EmailProvider;
  from: string;
  date: Date | undefined;
  messageId: string | undefined;
  logger: Logger;
  coldEmailActions?: ColdEmailRule["actions"];
}): Promise<boolean> {
  if (
    !from.trim() ||
    !date ||
    Number.isNaN(date.getTime()) ||
    !messageId?.trim()
  ) {
    logger.warn(
      "Assuming prior contact - message is missing a sender, date, or id",
    );
    return true;
  }

  try {
    const excludeLabelIds: string[] = [];
    const excludeFolderIds: string[] = [];
    for (const action of coldEmailActions ?? []) {
      if (action.type === "LABEL") {
        const id =
          action.labelId ||
          (action.label
            ? (await provider.getLabelByName(action.label))?.id
            : null);
        // A name-only label may not exist until the first cold email action creates it.
        // A failed lookup throws and reaches the fail-safe below instead.
        if (id) excludeLabelIds.push(id);
      } else if (action.type === "MOVE_FOLDER") {
        // The executor persists the ID after a successful move. Until then,
        // retain the unfiltered history check rather than creating a folder here.
        if (action.folderId) excludeFolderIds.push(action.folderId);
      }
    }
    return await provider.hasPreviousCommunicationsWithSenderOrDomain({
      from,
      date,
      messageId,
      ...(excludeLabelIds.length ? { excludeLabelIds } : {}),
      ...(excludeFolderIds.length ? { excludeFolderIds } : {}),
    });
  } catch (error) {
    logger.warn(
      "Assuming prior contact - could not check for previous emails",
      {
        error,
      },
    );
    return true;
  }
}
