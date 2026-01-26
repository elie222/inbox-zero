import { createAuthClient } from "better-auth/react";
import { env } from "@/env";
import { ssoClient } from "@better-auth/sso/client";
import { organizationClient } from "better-auth/client/plugins";

export const { signIn, signOut, signUp, useSession, getSession, sso } =
  createAuthClient({
    baseURL: env.NEXT_PUBLIC_BASE_URL,
    plugins: [ssoClient(), organizationClient()],
  });
