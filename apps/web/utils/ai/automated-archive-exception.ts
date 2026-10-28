import { ActionType } from "@/generated/prisma/enums";
import { env } from "@/env";
import { isWhitelistedSender } from "@/utils/email/whitelist";

export function shouldSkipAutomatedArchiveForSender({
  actionType,
  from,
}: {
  actionType: ActionType;
  from: string;
}) {
  return (
    actionType === ActionType.ARCHIVE &&
    isWhitelistedSender(from, env.WHITELIST_FROM)
  );
}
