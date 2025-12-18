import type { GetAuthLinkUrlResponse } from "@/app/api/google/linking/auth-url/route";
import type { GetOutlookAuthLinkUrlResponse } from "@/app/api/outlook/linking/auth-url/route";
import type { GetAuthLinkUrlResponse as GetFastmailAuthLinkUrlResponse } from "@/app/api/fastmail/linking/auth-url/route";

type Provider = "google" | "microsoft" | "fastmail";

const PROVIDER_DISPLAY_NAMES: Record<Provider, string> = {
  google: "Google",
  microsoft: "Microsoft",
  fastmail: "Fastmail",
};

/**
 * Initiates the OAuth account linking flow for Google, Microsoft, or Fastmail.
 * Returns the OAuth URL to redirect the user to.
 * @throws Error if the request fails
 */
export async function getAccountLinkingUrl(
  provider: Provider,
): Promise<string> {
  const apiProviderMap: Record<Provider, string> = {
    google: "google",
    microsoft: "outlook",
    fastmail: "fastmail",
  };
  const apiProvider = apiProviderMap[provider];

  const response = await fetch(`/api/${apiProvider}/linking/auth-url`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to initiate ${PROVIDER_DISPLAY_NAMES[provider]} account linking`,
    );
  }

  const data:
    | GetAuthLinkUrlResponse
    | GetOutlookAuthLinkUrlResponse
    | GetFastmailAuthLinkUrlResponse = await response.json();

  return data.url;
}
