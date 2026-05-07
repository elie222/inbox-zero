import { APIError } from "better-auth";
import { isAdmin } from "@/utils/admin";
import prisma from "@/utils/prisma";

export async function assertCanGenerateScimToken({
  userEmail,
  scimToken,
}: {
  userEmail?: string | null;
  scimToken: string;
}) {
  if (!isAdmin({ email: userEmail })) {
    throw new APIError("FORBIDDEN", {
      message: "Only admins can generate SCIM tokens",
    });
  }

  const providerId = getScimProviderIdFromToken(scimToken);
  if (!providerId) {
    throw new APIError("BAD_REQUEST", {
      message: "Invalid SCIM token",
    });
  }

  const ssoProvider = await prisma.ssoProvider.findUnique({
    where: { providerId },
    select: { id: true },
  });

  if (!ssoProvider) {
    throw new APIError("BAD_REQUEST", {
      message: "SCIM tokens can only be generated for registered SSO providers",
    });
  }
}

export function getScimProviderIdFromToken(scimToken: string) {
  const decoded = Buffer.from(scimToken, "base64url").toString("utf8");
  const [, providerId] = decoded.split(":");

  return providerId || null;
}
