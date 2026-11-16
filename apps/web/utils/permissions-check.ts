export function needsPermissionsReconnect(
  result: { hasAllPermissions: boolean; hasRefreshToken: boolean } | undefined,
) {
  // No result (the request itself failed) fails open. The action reports its
  // own provider errors as missing permissions, so those still send the user
  // to reconnect.
  if (!result) return false;
  return !result.hasAllPermissions || !result.hasRefreshToken;
}
