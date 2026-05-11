import { APIError } from "better-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import {
  assertCanGenerateScimToken,
  getScimProviderIdFromToken,
} from "@/utils/auth/scim";
import { isAdmin } from "@/utils/admin";

vi.mock("@/utils/prisma");
vi.mock("@/utils/admin", () => ({
  isAdmin: vi.fn(),
}));

describe("getScimProviderIdFromToken", () => {
  it("extracts the provider id from a Better Auth SCIM bearer token", () => {
    const token = createToken("secret", "provider-id");

    expect(getScimProviderIdFromToken(token)).toBe("provider-id");
  });

  it("returns null when the token does not contain a provider id", () => {
    const token = Buffer.from("secret-only", "utf8").toString("base64url");

    expect(getScimProviderIdFromToken(token)).toBeNull();
  });
});

describe("assertCanGenerateScimToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin users before checking providers", async () => {
    vi.mocked(isAdmin).mockReturnValue(false);

    await expect(
      assertCanGenerateScimToken({
        userEmail: "user@example.com",
        scimToken: createToken("secret", "provider-id"),
      }),
    ).rejects.toBeInstanceOf(APIError);

    expect(prisma.ssoProvider.findUnique).not.toHaveBeenCalled();
  });

  it("rejects tokens for providers that are not registered for SSO", async () => {
    vi.mocked(isAdmin).mockReturnValue(true);
    prisma.ssoProvider.findUnique.mockResolvedValue(null);

    await expect(
      assertCanGenerateScimToken({
        userEmail: "admin@example.com",
        scimToken: createToken("secret", "missing-provider"),
      }),
    ).rejects.toBeInstanceOf(APIError);

    expect(prisma.ssoProvider.findUnique).toHaveBeenCalledWith({
      where: { providerId: "missing-provider" },
      select: { id: true },
    });
  });

  it("allows admins to generate tokens for registered SSO providers", async () => {
    vi.mocked(isAdmin).mockReturnValue(true);
    prisma.ssoProvider.findUnique.mockResolvedValue({ id: "sso-provider-id" });

    await expect(
      assertCanGenerateScimToken({
        userEmail: "admin@example.com",
        scimToken: createToken("secret", "provider-id"),
      }),
    ).resolves.toBeUndefined();
  });
});

function createToken(secret: string, providerId: string) {
  return Buffer.from(`${secret}:${providerId}`, "utf8").toString("base64url");
}
