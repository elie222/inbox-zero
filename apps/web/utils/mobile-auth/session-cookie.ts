import { makeSignature } from "better-auth/crypto";
import type { betterAuthConfig } from "@/utils/auth";

type AuthContext = Awaited<typeof betterAuthConfig.$context>;

export async function buildMobileSessionCookie(input: {
  authContext: AuthContext;
  expiresAt: Date;
  sessionToken: string;
}) {
  const signedSessionToken = await makeSignature(
    input.sessionToken,
    input.authContext.secret,
  );
  const attributes = input.authContext.authCookies.sessionToken.attributes;
  const sameSite = attributes.sameSite;

  return {
    name: input.authContext.authCookies.sessionToken.name,
    value: `${input.sessionToken}.${signedSessionToken}`,
    options: {
      domain: attributes.domain,
      expires: input.expiresAt,
      httpOnly: attributes.httpOnly,
      maxAge: attributes.maxAge,
      partitioned: attributes.partitioned,
      path: attributes.path,
      sameSite: sameSite
        ? (sameSite.toLowerCase() as "strict" | "lax" | "none")
        : undefined,
      secure: attributes.secure,
    },
  };
}
