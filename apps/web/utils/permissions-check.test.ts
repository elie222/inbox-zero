import { describe, expect, it } from "vitest";
import { needsPermissionsReconnect } from "@/utils/permissions-check";

describe("needsPermissionsReconnect", () => {
  it("asks to reconnect when a required permission is missing", () => {
    expect(
      needsPermissionsReconnect({
        hasAllPermissions: false,
        hasRefreshToken: true,
      }),
    ).toBe(true);
  });

  it("asks to reconnect when the refresh token is gone", () => {
    expect(
      needsPermissionsReconnect({
        hasAllPermissions: true,
        hasRefreshToken: false,
      }),
    ).toBe(true);
  });

  it("lets the user continue when everything is granted", () => {
    expect(
      needsPermissionsReconnect({
        hasAllPermissions: true,
        hasRefreshToken: true,
      }),
    ).toBe(false);
  });

  it("lets the user continue when the check itself failed", () => {
    expect(needsPermissionsReconnect(undefined)).toBe(false);
  });
});
