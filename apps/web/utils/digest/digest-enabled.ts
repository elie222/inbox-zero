import { ActionType } from "@/generated/prisma/enums";
import type { Action } from "@/generated/prisma/client";

export function isDigestEnabled(ruleActions: Pick<Action, "type">[]) {
  return ruleActions.some((action) => action.type === ActionType.DIGEST);
}
