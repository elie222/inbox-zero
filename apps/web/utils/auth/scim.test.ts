import { beforeEach, expect, it, vi } from "vitest";
import { assertScimUserActive, getScimOptions } from "@/utils/auth/scim";
import prisma from "@/utils/__mocks__/prisma";
vi.mock("@/utils/prisma");
vi.mock("@/env", () => ({
  env: {
    SCIM_CREDENTIAL_HASH_SECRET:
      "test-scim-credential-secret-with-32-characters",
  },
}));
beforeEach(() => vi.clearAllMocks());

it("links only a reviewed connection and external identity mapping", async () => {
  prisma.scimIdentityLink.findUnique.mockResolvedValue({
    userId: "existing-user",
  } as never);
  const result = await getScimOptions().identity?.resolveUser?.(
    {
      connectionId: "connection",
      provisioningDomainId: "domain",
      resource: {
        externalId: "directory-subject",
        primaryEmail: "same@example.com",
      } as never,
    },
    {} as never,
  );
  expect(result).toEqual({
    action: "link",
    userId: "existing-user",
    profile: "preserve",
  });
  expect(prisma.scimIdentityLink.findUnique).toHaveBeenCalledWith({
    where: {
      connectionId_externalId: {
        connectionId: "connection",
        externalId: "directory-subject",
      },
    },
    select: { userId: true },
  });
});
it("does not link an existing user by email", async () => {
  const result = await getScimOptions().identity?.resolveUser?.(
    {
      connectionId: "connection",
      provisioningDomainId: "domain",
      resource: { primaryEmail: "same@example.com" } as never,
    },
    {} as never,
  );
  expect(result).toEqual({ action: "create" });
  expect(prisma.scimIdentityLink.findUnique).not.toHaveBeenCalled();
});
it("disables future logins and revokes sessions when deprovisioned", async () => {
  const database = { update: vi.fn(), deleteMany: vi.fn() };
  await getScimOptions().identity?.reconcileUser?.(
    { userId: "user", active: false, sources: [] },
    { database: database as never },
  );
  expect(database.update).toHaveBeenCalledWith({
    model: "user",
    where: [{ field: "id", value: "user" }],
    update: { scimAccessDisabled: true },
  });
  expect(database.deleteMany).toHaveBeenCalledWith({
    model: "session",
    where: [{ field: "userId", value: "user" }],
  });
});
it("blocks new sessions for users disabled through SCIM", async () => {
  prisma.user.findUnique.mockResolvedValue({
    scimAccessDisabled: true,
  } as never);
  await expect(assertScimUserActive("user")).rejects.toThrow(
    "Account access was disabled",
  );
});
it("allows sessions for users who are not disabled", async () => {
  prisma.user.findUnique.mockResolvedValue({
    scimAccessDisabled: false,
  } as never);
  await expect(assertScimUserActive("user")).resolves.toBeUndefined();
});
