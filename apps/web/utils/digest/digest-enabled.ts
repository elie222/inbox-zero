import { ActionType, type Action } from "@prisma/client";

export function isDigestEnabled(ruleActions: Pick<Action, "type">[]) {
  return ruleActions.some((action) => action.type === ActionType.DIGEST);
}
