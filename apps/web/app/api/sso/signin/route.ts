import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const getSsoSignInSchema = z.object({
  email: z.string().email(),
  organizationSlug: z.string(),
});
export type GetSsoSignInParams = z.infer<typeof getSsoSignInSchema>;
export type GetSsoSignInResponse = {
  redirectUrl: string;
  providerId: string;
};

const logger = createScopedLogger("api/sso/signin");

export const GET = withError(async (request: NextRequest) => {
  const { searchParams } = new URL(request.url);
  const { email, organizationSlug } = getSsoSignInSchema.parse({
    email: searchParams.get("email"),
    organizationSlug: searchParams.get("organizationSlug"),
  });

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
    throw new SafeError("No SSO provider found for this organization");
  }

  const ssoResponse = await betterAuthConfig.api.signInSSO({
    body: {
      providerId: provider.providerId,
      callbackURL: "/accounts",
    },
  });

  const response: GetSsoSignInResponse = {
    redirectUrl: ssoResponse.url,
    providerId: provider.providerId,
  };

  return NextResponse.json(response);
});
