import { type NextRequest, NextResponse } from "next/server";
import { betterAuthConfig } from "@/utils/auth";
import { createScopedLogger } from "@/utils/logger";
import { withError } from "@/utils/middleware";
import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("api/sso/signin");

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  let providerId: string | null | undefined = searchParams.get("providerId");

  if (!email) {
    throw new SafeError("Email parameter is required");
  }

  logger.info("SSO sign-in requested", { email, providerId });

  let domain: string;
  if (!providerId) {
    domain = email.split("@")[1];
    if (!domain) {
      throw new SafeError("Invalid email format");
    }
    const provider = await prisma.ssoProvider.findFirst({
      where: { domain: domain },
      select: {
        providerId: true,
      },
    });
    providerId = provider?.providerId;
  }

  if (!providerId) {
    logger.error("No SSO provider found for sign-in", { email, providerId });
    throw new SafeError("No SSO provider found for sign-in");
  }

  const ssoResponse = await betterAuthConfig.api.signInSSO({
    body: {
      providerId,
      callbackURL: "/accounts",
    },
  });

  return NextResponse.json({
    redirectUrl: ssoResponse.url,
    providerId,
  });
});
