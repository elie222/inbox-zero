import { afterAll, expect, it, vi } from "vitest";
import { betterAuthConfig } from "@/utils/auth";
import prisma from "@/utils/prisma";

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    AUTH_SECRET: "test-auth-schema-secret-at-least-32-characters",
    SCIM_CREDENTIAL_HASH_SECRET:
      "test-scim-schema-secret-at-least-32-characters",
    DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
    EMAIL_ENCRYPT_SECRET: "test-secret",
    EMAIL_ENCRYPT_SALT: "test-salt",
    MCP_SERVER_ENABLED: true,
    NEXT_PUBLIC_EXTERNAL_API_ENABLED: true,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    ADMINS: [],
  },
}));

vi.mock("@/utils/prisma", async (importOriginal) => {
  const module = await importOriginal<typeof import("@/utils/prisma")>();
  vi.spyOn(module.default.oauthResource, "findFirst").mockResolvedValue({
    id: "test-resource",
    identifier: "https://example.com/api/mcp-server",
  } as never);
  return module;
});

afterAll(() => prisma.$disconnect());

it("starts the actual auth configuration against generated Prisma metadata without a database connection", async () => {
  const response = await betterAuthConfig.handler(
    new Request("https://example.com/api/auth/ok"),
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
});
