import { type NextRequest, NextResponse } from "next/server";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/sso/signin");

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  const organizationSlug = searchParams.get("organizationSlug");

  if (!email) {
    throw new SafeError("Email parameter is required");
  }

  if (!organizationSlug) {
    throw new SafeError("Organization name parameter is required");
  }

  logger.info("SSO sign-in requested", { email, organizationSlug });

  const provider = await prisma.ssoProvider.findFirst({
    where: {
      organization: {
        slug: organizationSlug,
      },
    },
    select: {
      providerId: true,
    },
  });

  if (!provider) {
    logger.error("No SSO provider found for sign-in", {
      email,
      organizationSlug,
    });
    return NextResponse.redirect(
      new URL("/login/error?error=organization_not_found", request.url),
    );
  }

  const ssoResponse = await betterAuthConfig.api.signInSSO({
    body: {
      providerId: provider.providerId,
      callbackURL: "/accounts",
    },
  });

  return NextResponse.json({
    redirectUrl: ssoResponse.url,
    providerId: provider.providerId,
  });
});
