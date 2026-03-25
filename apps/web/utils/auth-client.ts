import { createAuthClient } from "better-auth/react";
import { env } from "@/env";
import { ssoClient } from "@better-auth/sso/client";
import {
  genericOAuthClient,
  organizationClient,
} from "better-auth/client/plugins";

export const { signIn, signOut, signUp, useSession, getSession, sso } =
  createAuthClient({
    baseURL: env.NEXT_PUBLIC_BASE_URL,
    plugins: [ssoClient(), organizationClient()],
  });

function createGenericOauthAuthClient() {
  return createAuthClient({
    baseURL: env.NEXT_PUBLIC_BASE_URL,
    plugins: [genericOAuthClient()],
  });
}

export async function signInWithOauth2(
  options: Parameters<
    ReturnType<typeof createGenericOauthAuthClient>["signIn"]["oauth2"]
  >[0],
) {
  const { signIn } = createGenericOauthAuthClient();

  return signIn.oauth2(options);
}
