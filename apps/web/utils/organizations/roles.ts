export function hasOrganizationAdminRole(role: string): boolean {
  return ["admin", "owner"].includes(role);
}
