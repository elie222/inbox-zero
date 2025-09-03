import { NextResponse } from "next/server";
import { z } from "zod";
import { isAdmin } from "@/utils/admin";
import { auth } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";
import { withAuth } from "@/utils/middleware";
import { registerSSOProvider } from "@/utils/register-sso-provider";

const logger = createScopedLogger("api/sso/register");

const registerSSOProviderBody = z.object({
  idpMetadata: z
    .string()
    .min(1, "IdP metadata is the SAML IDP XML metadata of the provider"),
  providerId: z
    .string()
    .min(
      1,
      "A provider ID for internal usage. It must match the callback URL api/auth/sso/saml2/callback/<providerId>",
    ),
  organizationName: z.string().min(1, "The organization name of the provider"),
  domain: z.string().min(1, "The domain of the provider"),
});

export const POST = withAuth(async (request) => {
  try {
    // Only admins should be able to register SSO providers
    const session = await auth();
    if (!isAdmin({ email: session?.user?.email })) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const json = await request.json();
    const { success, data, error } = registerSSOProviderBody.safeParse(json);

    if (!success) {
      return NextResponse.json(
        { error: "Invalid request body", details: error.errors },
        { status: 400 },
      );
    }

    const { idpMetadata, organizationName, domain, providerId } = data;

    const result = await registerSSOProvider({
      idpMetadata,
      providerId,
      organizationName,
      domain,
      userId: request.auth.userId,
      headers: request.headers,
    });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    logger.error("SSO provider registration failed:", { error });
    return NextResponse.json(
      {
        error: "SSO provider registration failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
