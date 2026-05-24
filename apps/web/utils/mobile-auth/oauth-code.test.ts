import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    verificationToken: {
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/env", () => ({
  env: {
    AUTH_SECRET: "test-auth-secret",
    NEXTAUTH_SECRET: undefined,
  },
}));

vi.mock("@/utils/prisma", () => ({
  default: prismaMock,
}));

import {
  consumeMobileAuthCode,
  createMobileAuthCode,
  isValidMobileAuthState,
} from "./oauth-code";

describe("mobile auth OAuth code", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.verificationToken.create.mockResolvedValue({});
    prismaMock.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
  });

  it("stores a hashed one-time code bound to state and user", async () => {
    const code = await createMobileAuthCode({
      state: "state-1234567890",
      userId: "user-1",
    });

    expect(code).toHaveLength(43);
    expect(prismaMock.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        expires: { lt: expect.any(Date) },
        identifier: { startsWith: "mobile-auth:" },
      },
    });
    expect(prismaMock.verificationToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        expires: expect.any(Date),
        identifier: "mobile-auth:state-1234567890:user-1",
        token: expect.not.stringContaining(code),
      }),
    });
  });

  it("consumes a matching unused code once", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      identifier: "mobile-auth:state-1234567890:user-1",
    });
    prismaMock.verificationToken.delete.mockResolvedValue({});

    await expect(
      consumeMobileAuthCode({
        code: "code-1",
        state: "state-1234567890",
      }),
    ).resolves.toEqual({ userId: "user-1" });
    expect(prismaMock.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: expect.any(String) },
    });
  });

  it("rejects an unknown code", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue(null);

    await expect(
      consumeMobileAuthCode({
        code: "code-1",
        state: "state-1234567890",
      }),
    ).rejects.toThrow("Invalid or expired authentication code");
    expect(prismaMock.verificationToken.delete).not.toHaveBeenCalled();
  });

  it("treats a race with a concurrent consumer as an expired code", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      identifier: "mobile-auth:state-1234567890:user-1",
    });
    prismaMock.verificationToken.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Not found", {
        code: "P2025",
        clientVersion: "test",
      }),
    );

    await expect(
      consumeMobileAuthCode({
        code: "code-1",
        state: "state-1234567890",
      }),
    ).rejects.toThrow("Invalid or expired authentication code");
  });

  it("rejects invalid states", async () => {
    expect(isValidMobileAuthState("short")).toBe(false);

    await expect(
      createMobileAuthCode({
        state: "short",
        userId: "user-1",
      }),
    ).rejects.toThrow("Invalid authentication state");
  });

  it("rejects state mismatches without consuming the code", async () => {
    prismaMock.verificationToken.findUnique.mockResolvedValue({
      expires: new Date(Date.now() + 60_000),
      identifier: "mobile-auth:state-1234567890:user-1",
    });

    await expect(
      consumeMobileAuthCode({
        code: "code-1",
        state: "state-0987654321",
      }),
    ).rejects.toThrow("Invalid authentication state");
    expect(prismaMock.verificationToken.delete).not.toHaveBeenCalled();
  });
});
