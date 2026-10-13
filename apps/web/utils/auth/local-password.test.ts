import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyPassword } from "better-auth/crypto";
import { env } from "@/env";
import prisma from "@/utils/__mocks__/prisma";
import { setLocalPassword } from "./local-password";

vi.mock("@/env", () => ({ env: { LOCAL_PASSWORD_AUTH_ENABLED: true } }));
vi.mock("@/utils/prisma");

beforeEach(() => {
  vi.clearAllMocks();
  env.LOCAL_PASSWORD_AUTH_ENABLED = true;
});

describe("local password provisioning", () => {
  it("adds a hashed credential to the existing user without creating another user", async () => {
    prisma.user.findUnique.mockResolvedValue({ id: "existing-user" } as never);
    prisma.account.upsert.mockResolvedValue({} as never);
    const password = "local test password with spaces";
    await setLocalPassword({ email: " Owner@Example.com ", password });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { email: "owner@example.com" },
      select: { id: true },
    });
    const saved = prisma.account.upsert.mock.calls[0][0];
    expect(saved.create).toMatchObject({
      userId: "existing-user",
      provider: "credential",
      providerAccountId: "existing-user",
    });
    expect(
      await verifyPassword({ password, hash: saved.create.password as string }),
    ).toBe(true);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it("does not provision credentials while password login is disabled", async () => {
    env.LOCAL_PASSWORD_AUTH_ENABLED = false;
    await expect(
      setLocalPassword({
        email: "owner@example.com",
        password: "local password",
      }),
    ).rejects.toThrow("Enable LOCAL_PASSWORD_AUTH_ENABLED");
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });

  it("rejects unknown users without creating an account", async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      setLocalPassword({
        email: "unknown@example.com",
        password: "local password",
      }),
    ).rejects.toThrow("No existing user");
    expect(prisma.account.upsert).not.toHaveBeenCalled();
  });
});
