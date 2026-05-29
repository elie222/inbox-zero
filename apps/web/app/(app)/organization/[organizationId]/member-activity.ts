export const RECENT_ACTIVITY_HOURS = 24;

export type MemberActivityStatus =
  | "active"
  | "disconnected"
  | "hidden"
  | "inactive"
  | "none";

export function getMemberActivityStatus({
  allowOrgAdminAnalytics,
  disconnectedAt,
  lastProcessedEmailAt,
  now = new Date(),
}: {
  allowOrgAdminAnalytics: boolean;
  disconnectedAt?: Date | string | null;
  lastProcessedEmailAt?: Date | string | null;
  now?: Date;
}): MemberActivityStatus {
  if (disconnectedAt) return "disconnected";
  if (!allowOrgAdminAnalytics) return "hidden";
  if (!lastProcessedEmailAt) return "none";

  const lastProcessedDate = new Date(lastProcessedEmailAt);
  const recentActivityThreshold = new Date(
    now.getTime() - RECENT_ACTIVITY_HOURS * 60 * 60 * 1000,
  );

  return lastProcessedDate >= recentActivityThreshold ? "active" : "inactive";
}
