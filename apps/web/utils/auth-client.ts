import { createAuthClient } from "better-auth/react";
import { env } from "@/env";
import { ssoClient } from "@better-auth/sso/client";
import { organizationClient } from "better-auth/client/plugins";

// DEBUG: Log auth client baseURL (check browser console)
console.log("[auth-client] baseURL:", env.NEXT_PUBLIC_BASE_URL);
console.log("[auth-client] window.location.origin:", typeof window !== "undefined" ? window.location.origin : "SSR");

export const { signIn, signOut, signUp, useSession, getSession, sso } =
  createAuthClient({
    baseURL: env.NEXT_PUBLIC_BASE_URL,
    plugins: [ssoClient(), organizationClient()],
  });
