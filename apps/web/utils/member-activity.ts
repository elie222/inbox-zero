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

/**
 * Label and badge variant per activity status.
 *
 * Shared by the org members table and the admin user list; the tooltip copy
 * stays with each surface because it differs between them.
 */
export const ACTIVITY_BADGE: Record<
  MemberActivityStatus,
  { label: string; variant: "green" | "red" | "outline" | "secondary" }
> = {
  active: { label: "Active", variant: "green" },
  disconnected: { label: "Disconnected", variant: "red" },
  hidden: { label: "Activity hidden", variant: "outline" },
  inactive: {
    label: `No activity in ${RECENT_ACTIVITY_HOURS}h`,
    variant: "secondary",
  },
  none: { label: "No activity yet", variant: "secondary" },
};
