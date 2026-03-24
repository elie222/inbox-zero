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
    // This client plugin is inert unless the server enables generic OAuth, but
    // keeping it loaded ensures signIn.oauth2 is available when emulation is on.
    plugins: [ssoClient(), organizationClient(), genericOAuthClient()],
  });
