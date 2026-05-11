import { ActionType } from "@/generated/prisma/enums";
import { env } from "@/env";
import { extractEmailAddress } from "@/utils/email";

export function shouldSkipAutomatedArchiveForSender({
  actionType,
  from,
}: {
  actionType: ActionType;
  from: string;
}) {
  if (actionType !== ActionType.ARCHIVE || !env.WHITELIST_FROM) return false;

  return (
    extractEmailAddress(from).toLowerCase() ===
    extractEmailAddress(env.WHITELIST_FROM).toLowerCase()
  );
}
