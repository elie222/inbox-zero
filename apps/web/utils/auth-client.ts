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
  const response = await fetch("/api/auth/sign-in/oauth2", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(options),
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
