import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";
import { organizationClient } from "better-auth/client/plugins";

// Don't pass baseURL - better-auth will use relative paths which automatically
// work on any origin (production, staging, or preview deploys)
export const { signIn, signOut, signUp, useSession, getSession, sso } =
  createAuthClient({
    plugins: [ssoClient(), organizationClient()],
  });
