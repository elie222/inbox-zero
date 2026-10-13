import { beforeEach, describe, expect, it, vi } from "vitest";
import { APIError } from "better-auth";
import { env } from "@/env";
import { betterAuthConfig } from "@/utils/auth";
import prisma from "@/utils/__mocks__/prisma";
import { updateLocalPassword } from "./update-local-password";
import { updateLocalPasswordBody } from "@/utils/actions/local-password.validation";

vi.mock("@/env", () => ({ env: { LOCAL_PASSWORD_AUTH_ENABLED: true } }));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  betterAuthConfig: { api: { changePassword: vi.fn(), setPassword: vi.fn() } },
}));

const input = {
  userId: "owner",
  requestHeaders: new Headers(),
  currentPassword: "old password",
  newPassword: "new local password",
};

beforeEach(() => {
  vi.resetAllMocks();
  env.LOCAL_PASSWORD_AUTH_ENABLED = true;
});

describe("local password changes", () => {
  it("verifies the current password through the authenticated session", async () => {
    prisma.account.findFirst.mockResolvedValue({ password: "hash" } as never);
    await updateLocalPassword(input);
    expect(betterAuthConfig.api.changePassword).toHaveBeenCalledWith({
      headers: input.requestHeaders,
      body: {
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: false,
      },
    });
    expect(betterAuthConfig.api.setPassword).not.toHaveBeenCalled();
  });
  it("requires the current password for an existing credential", async () => {
    prisma.account.findFirst.mockResolvedValue({ password: "hash" } as never);
    await expect(
      updateLocalPassword({ ...input, currentPassword: undefined }),
    ).rejects.toThrow("Enter your current password");
    expect(betterAuthConfig.api.changePassword).not.toHaveBeenCalled();
    expect(betterAuthConfig.api.setPassword).not.toHaveBeenCalled();
  });
  it("allows an authenticated owner to set their first local password", async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await updateLocalPassword({ ...input, currentPassword: undefined });
    expect(betterAuthConfig.api.setPassword).toHaveBeenCalledWith({
      headers: input.requestHeaders,
      body: { newPassword: input.newPassword },
    });
  });
  it("rejects changes when local login is disabled", async () => {
    env.LOCAL_PASSWORD_AUTH_ENABLED = false;
    await expect(updateLocalPassword(input)).rejects.toThrow("not enabled");
    expect(betterAuthConfig.api.changePassword).not.toHaveBeenCalled();
  });
  it("reports an incorrect current password without exposing credentials", async () => {
    prisma.account.findFirst.mockResolvedValue({ password: "hash" } as never);
    vi.mocked(betterAuthConfig.api.changePassword).mockRejectedValue(
      new APIError("BAD_REQUEST", {
        code: "INVALID_PASSWORD",
        message: "Invalid password",
      }),
    );
    await expect(updateLocalPassword(input)).rejects.toThrow(
      "Your current password is incorrect",
    );
  });
  it("rejects mismatched confirmation before submitting", () => {
    expect(
      updateLocalPasswordBody.safeParse({
        newPassword: "new password 123",
        confirmPassword: "different password",
      }).success,
    ).toBe(false);
  });
});
