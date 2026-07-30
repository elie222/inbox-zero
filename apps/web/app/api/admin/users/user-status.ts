import type { MemberActivityStatus } from "@/utils/member-activity";

// "active" wins because a user with one working mailbox is not broken.
// Among the rest "disconnected" comes first: it is the only state an admin can
// act on. "hidden" is absent because it only exists for the org-analytics
// privacy gate, which does not apply to system admins.
const STATUS_PRIORITY = [
  "active",
  "disconnected",
  "inactive",
  "none",
] as const satisfies readonly MemberActivityStatus[];

/**
 * One status for a user who may own several mailboxes.
 * Returns null when the user has no mailboxes at all.
 */
export function rollUpUserStatus(
  statuses: MemberActivityStatus[],
): MemberActivityStatus | null {
  const found = STATUS_PRIORITY.find((status) => statuses.includes(status));
  return found ?? null;
}
