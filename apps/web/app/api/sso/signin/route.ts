import { z } from "zod";
import { NextResponse } from "next/server";
import { betterAuthConfig } from "@/utils/auth";
import { SafeError } from "@/utils/error";
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

export const GET = withError("sso/signin", async (request) => {
  const { searchParams } = new URL(request.url);
  const { email, organizationSlug } = getSsoSignInSchema.parse({
    email: searchParams.get("email"),
    organizationSlug: searchParams.get("organizationSlug"),
  });

  request.logger.info("SSO sign-in requested", { email, organizationSlug });

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
    request.logger.error("No SSO provider found for sign-in", {
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
