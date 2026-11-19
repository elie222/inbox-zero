import { ActionType } from "@/generated/prisma/enums";

// "Draft replies" is on when the To Reply rule is enabled and drafts. The
// settings switch and follow-up drafting both read it so they never disagree.
export function isDraftRepliesEnabled(
  toReplyRule:
    | { enabled: boolean; actions: { type: ActionType }[] }
    | null
    | undefined,
) {
  return (
    !!toReplyRule?.enabled &&
    toReplyRule.actions.some((action) => action.type === ActionType.DRAFT_EMAIL)
  );
}
