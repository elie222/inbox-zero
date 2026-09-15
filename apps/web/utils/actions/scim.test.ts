import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createScimConnectionAction, revokeScimCredentialAction } from "./scim";

const { mockAuth, createConnection, revokeCredential } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  createConnection: vi.fn(),
  revokeCredential: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@sentry/nextjs", () => import("@/__tests__/mocks/sentry-nextjs.mock"));
vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: mockAuth,
  betterAuthConfig: {
    api: {
      createSCIMManagedConnection: createConnection,
      revokeSCIMManagedCredential: revokeCredential,
    },
  },
}));
vi.mock("@/env", () => ({
  env: {
    ADMINS: ["admin@example.com"],
    SCIM_CREDENTIAL_HASH_SECRET: "test-only-scim-secret-with-32-characters",
    NODE_ENV: "test",
  },
}));

const input = {
  providerId: "registered-provider",
  creationRequestId: "8102e230-bd72-4283-a9a8-c6c328fa70fe",
  expiresAt: new Date("2099-01-01"),
};

describe("SCIM credential administration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin", email: "admin@example.com" },
      session: { emailOtp: false },
    });
    prisma.ssoProvider.findUnique.mockResolvedValue({
      organizationId: "org",
    } as never);
    createConnection.mockResolvedValue({ token: "new-opaque-token" });
  });
  it("rejects non-admin callers before issuing credentials", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user", email: "user@example.com" },
      session: { emailOtp: false },
    });
    const result = await createScimConnectionAction(input);
    expect(result?.serverError).toBeTruthy();
    expect(createConnection).not.toHaveBeenCalled();
  });
  it("rejects email-code sessions", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "admin", email: "admin@example.com" },
      session: { emailOtp: true },
    });
    expect((await createScimConnectionAction(input))?.serverError).toBeTruthy();
    expect(createConnection).not.toHaveBeenCalled();
  });
  it("requires an organization SSO provider", async () => {
    prisma.ssoProvider.findUnique.mockResolvedValue(null);
    expect((await createScimConnectionAction(input))?.serverError).toBeTruthy();
    expect(createConnection).not.toHaveBeenCalled();
  });
  it("issues only user-provisioning credentials in the registered provider domain", async () => {
    expect((await createScimConnectionAction(input))?.data).toEqual({
      token: "new-opaque-token",
    });
    expect(createConnection).toHaveBeenCalledWith({
      body: {
        provisioningDomainId: input.providerId,
        creationRequestId: input.creationRequestId,
        expiresAt: input.expiresAt,
        actorId: "admin",
        scopes: ["scim.users.read", "scim.users.write"],
      },
    });
  });
  it("keeps credential revocation scoped to its provider domain", async () => {
    await revokeScimCredentialAction({
      providerId: input.providerId,
      connectionId: "connection",
      credentialId: "credential",
    });
    expect(revokeCredential).toHaveBeenCalledWith({
      body: {
        provisioningDomainId: input.providerId,
        connectionId: "connection",
        credentialId: "credential",
        actorId: "admin",
      },
    });
  });
});
