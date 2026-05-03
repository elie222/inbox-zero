import { createEmulator, type Emulator } from "emulate";
import { NextRequest } from "next/server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { discoverOIDCConfig, type OIDCConfig } from "@better-auth/sso";
import prisma from "@/utils/__mocks__/prisma";
import { GET } from "@/app/api/sso/signin/route";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@inboxzero/loops", () => ({
  createContact: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@inboxzero/resend", () => ({
  createContact: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@inboxzero/tinybird", () => ({
  publishArchive: vi.fn().mockResolvedValue(undefined),
  publishDelete: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@inboxzero/tinybird-ai-analytics", () => ({
  publishAiCall: vi.fn().mockResolvedValue(undefined),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "true";
const TEST_PORT = 4121;
const PROVIDER_ID = "okta-provider";
const ORGANIZATION_SLUG = "okta-test-org";
const ORGANIZATION_ID = "org_okta_test";
const USER_EMAIL = "user@example.com";
const CLIENT_ID = "okta-sso-client";
const CLIENT_SECRET = "okta-sso-secret";
const CALLBACK_URL =
  "http://localhost:3000/api/auth/sso/callback/okta-provider";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Okta SSO integration",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;
    let oidcConfig: OIDCConfig;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "okta",
        port: TEST_PORT,
        seed: {
          okta: {
            users: [
              {
                okta_id: "00u_okta_user_1",
                login: USER_EMAIL,
                email: USER_EMAIL,
                first_name: "Test",
                last_name: "User",
              },
            ],
            authorization_servers: [
              {
                id: "default",
                name: "default",
                audiences: ["api://default"],
              },
            ],
            oauth_clients: [
              {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                name: "Inbox Zero SSO",
                redirect_uris: [CALLBACK_URL],
                auth_server_id: "default",
                token_endpoint_auth_method: "client_secret_post",
              },
            ],
          },
        },
      });

      const issuer = `${emulator.url}/oauth2/default`;
      const discoveredConfig = await discoverOIDCConfig({
        issuer,
        isTrustedOrigin: (url) => url.startsWith(emulator.url),
      });

      oidcConfig = {
        ...discoveredConfig,
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        pkce: true,
        scopes: ["openid", "email", "profile"],
        mapping: {
          id: "sub",
          email: "email",
          emailVerified: "email_verified",
          name: "name",
        },
      };
    });

    afterAll(async () => {
      await emulator?.close();
    });

    beforeEach(() => {
      vi.clearAllMocks();

      prisma.ssoProvider.findFirst.mockImplementation(async (args) => {
        const where = args?.where as
          | {
              organization?: { slug?: string };
              providerId?: { equals?: string } | string;
            }
          | undefined;

        if (where?.organization?.slug === ORGANIZATION_SLUG) {
          return { providerId: PROVIDER_ID } as never;
        }

        const providerId =
          typeof where?.providerId === "string"
            ? where.providerId
            : where?.providerId?.equals;

        if (providerId === PROVIDER_ID) {
          return {
            id: "sso_provider_1",
            issuer: oidcConfig.issuer,
            oidcConfig: JSON.stringify(oidcConfig),
            samlConfig: null,
            providerId: PROVIDER_ID,
            organizationId: ORGANIZATION_ID,
            domain: "example.com",
          } as never;
        }

        return null;
      });

      prisma.verificationToken.create.mockImplementation(
        async ({ data }) => data as never,
      );
    });

    test("starts SSO with an Okta OIDC provider", async () => {
      const request = new NextRequest(
        `http://localhost/api/sso/signin?${new URLSearchParams({
          email: USER_EMAIL,
          organizationSlug: ORGANIZATION_SLUG,
        })}`,
      );

      const response = await GET(request, { params: Promise.resolve({}) });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.providerId).toBe(PROVIDER_ID);

      const redirectUrl = new URL(body.redirectUrl);
      expect(redirectUrl.origin).toBe(emulator.url);
      expect(redirectUrl.pathname).toBe("/oauth2/default/v1/authorize");
      expect(redirectUrl.searchParams.get("client_id")).toBe(CLIENT_ID);
      expect(redirectUrl.searchParams.get("redirect_uri")).toBe(CALLBACK_URL);
      expect(redirectUrl.searchParams.get("response_type")).toBe("code");
      expect(redirectUrl.searchParams.get("login_hint")).toBe(USER_EMAIL);
      expect(redirectUrl.searchParams.get("scope")?.split(" ")).toEqual([
        "openid",
        "email",
        "profile",
      ]);
      expect(redirectUrl.searchParams.get("code_challenge")).toBeTruthy();
      expect(redirectUrl.searchParams.get("code_challenge_method")).toBe(
        "S256",
      );

      const oktaResponse = await fetch(body.redirectUrl);
      const oktaHtml = await oktaResponse.text();

      expect(oktaResponse.status).toBe(200);
      expect(oktaHtml).toContain("Sign in with Okta");
      expect(oktaHtml).toContain(USER_EMAIL);
    });
  },
);
