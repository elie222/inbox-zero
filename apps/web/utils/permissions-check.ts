export function needsPermissionsReconnect(
  result: { hasAllPermissions: boolean; hasRefreshToken: boolean } | undefined,
) {
  // A failed check fails open: only a confirmed gap sends the user to reconnect.
  if (!result) return false;
  return !result.hasAllPermissions || !result.hasRefreshToken;
}
