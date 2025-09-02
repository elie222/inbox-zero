import { betterAuthConfig } from "@/utils/auth";
import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";

export const POST = async (request: Request) => {
  try {
    const body = await request.json();

    const { providerId } = body;

    // First, check if the SSO provider already exists
    const existingProvider = await prisma.ssoProvider.findUnique({
      where: { providerId },
    });

    // Only register if the provider doesn't exist
    // TODO: Move the provider registration to an admin function
    if (!existingProvider) {
      // This is for testing only.
      if (
        !process.env.OKTA_CERT_TEST_ORG ||
        !process.env.OKTA_IDP_METADATA ||
        !process.env.OKTA_SP_METADATA ||
        !process.env.OKTA_PRIVATE_KEY_TEST_ORG
      ) {
        throw new Error(
          "Missing required environment variables for SSO registration",
        );
      }

      await betterAuthConfig.api.registerSSOProvider({
        body: {
          providerId,
          issuer: "http://www.okta.com/exkv0mu19cZ0LNKEo697",
          domain: "getinboxzero.com",
          samlConfig: {
            entryPoint:
              "https://integrator-9554919.okta.com/app/integrator-9554919_inboxzerosaml_1/exkv0mu19cZ0LNKEo697/sso/saml",
            cert: process.env.OKTA_CERT_TEST_ORG,
            callbackUrl: "http://localhost:3000/api/auth/sso/callback/okta",
            audience: "http://localhost:3000",
            wantAssertionsSigned: false,
            signatureAlgorithm: "sha256",
            digestAlgorithm: "sha256",
            identifierFormat:
              "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
            idpMetadata: {
              metadata: process.env.OKTA_IDP_METADATA,
              privateKey: process.env.OKTA_PRIVATE_KEY_TEST_ORG,
              isAssertionEncrypted: false,
            },
            spMetadata: {
              metadata: process.env.OKTA_SP_METADATA,
              binding: "post",
              privateKey: process.env.OKTA_PRIVATE_KEY_TEST_ORG,
              isAssertionEncrypted: false,
            },
          },
          mapping: {
            id: "nameID",
            email: "email",
            name: "displayName",
            extraFields: {
              department: "department",
              role: "role",
            },
          },
        },
        // TODO: Move this registerSSOProvider to an admin function
        // This needs to happen only once for a given organization.
        // Temporarily use the middleware withAuth to pass any user authentication.
        headers: request.headers,
      });
    }

    const samlConfig = existingProvider
      ? JSON.parse(existingProvider.samlConfig || "{}")
      : null;
    const redirectUrl = samlConfig?.entryPoint || "";

    return NextResponse.json({
      success: true,
      redirectUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "SSO sign-in failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
};
