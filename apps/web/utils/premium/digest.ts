import { ActionType } from "@/generated/prisma/enums";

export function hasDigestAction(
  actions: { type: ActionType }[] | undefined,
): boolean {
  return !!actions?.some((action) => action.type === ActionType.DIGEST);
}

export function isAddingDigestAction({
  requestedActions,
  existingActions,
}: {
  requestedActions: { type: ActionType }[];
  existingActions?: { type: ActionType }[];
}): boolean {
  return hasDigestAction(requestedActions) && !hasDigestAction(existingActions);
}

export function shouldIncludeDigestAction({
  digestFeatureEnabled,
  hasDigestAccess,
  wantsDigest,
  hasExistingDigest,
}: {
  digestFeatureEnabled: boolean;
  hasDigestAccess: boolean;
  wantsDigest: boolean;
  hasExistingDigest: boolean;
}): boolean {
  if (!digestFeatureEnabled) return hasExistingDigest;
  if (hasDigestAccess) return wantsDigest;
  return wantsDigest && hasExistingDigest;
}
