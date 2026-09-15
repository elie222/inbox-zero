import { createAuthClient } from "better-auth/react";
import { ssoClient } from "@better-auth/sso/client";
import { emailOTPClient, organizationClient } from "better-auth/client/plugins";

export const {
  signIn,
  signOut,
  signUp,
  useSession,
  getSession,
  sso,
  emailOtp,
} = createAuthClient({
  plugins: [ssoClient(), organizationClient(), emailOTPClient()],
});

export async function signInWithSocialRedirect(
  options: Parameters<typeof signIn.social>[0],
) {
  const response = await fetch("/api/auth/sign-in/social", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...options, disableRedirect: true }),
  });

  const payload = await parseOauth2Response(response);
  if (!response.ok) {
    throw new Error(
      payload.error || `Request failed with status ${response.status}`,
    );
  }

  return payload;
}

async function parseOauth2Response(response: Response) {
  try {
    const data = (await response.json()) as {
      url?: string;
      message?: string;
      error?: string;
    };

    return {
      url: data.url,
      error: data.error || data.message,
    };
  } catch {
    return {
      error: `Request failed with status ${response.status}`,
    };
  }
}
