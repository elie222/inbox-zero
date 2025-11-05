import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";
import { organizationClient } from "better-auth/client/plugins";

// Do not hardcode absolute baseURL on the client.
// Using a relative base avoids leaking localhost or build-time values.
export const { signIn, signOut, signUp, useSession, getSession, sso } =
  createAuthClient({
    plugins: [ssoClient(), organizationClient()],
  });
