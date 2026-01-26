import { createAuthClient } from "better-auth/react";
import { env } from "@/env";
import { ssoClient } from "@better-auth/sso/client";
import { organizationClient } from "better-auth/client/plugins";

// On client: use current origin (handles preview deploys automatically)
// On server (SSR): use env.NEXT_PUBLIC_BASE_URL for server-side requests
const getAuthBaseUrl = () => {
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return env.NEXT_PUBLIC_BASE_URL;
};

export const { signIn, signOut, signUp, useSession, getSession, sso } =
  createAuthClient({
    baseURL: getAuthBaseUrl(),
    plugins: [ssoClient(), organizationClient()],
  });
