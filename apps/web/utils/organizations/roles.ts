export const ADMIN_ROLES = ["admin", "owner"];

export function hasOrganizationAdminRole(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

export function isOrganizationAdmin(
  members: Array<{ role: string }> | undefined,
): boolean {
  if (!members || members.length === 0) return false;

  return members.some((member) => hasOrganizationAdminRole(member.role));
}
