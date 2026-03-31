import type { GetAuthLinkUrlResponse } from "@/app/api/google/linking/auth-url/route";
import type { GetOutlookAuthLinkUrlResponse } from "@/app/api/outlook/linking/auth-url/route";
import { isGoogleProvider } from "@/utils/email/provider-types";

/**
 * Initiates the OAuth account linking flow for Google or Microsoft.
 * Returns a URL to redirect the user to (OAuth provider, or /logout if
 * the session is stale).
 * @throws Error if the request fails for a non-recoverable reason
 */
export async function getAccountLinkingUrl(
  provider: "google" | "microsoft",
): Promise<string> {
  const apiProvider = provider === "microsoft" ? "outlook" : "google";

  const response = await fetch(`/api/${apiProvider}/linking/auth-url`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      redirectTo?: string;
    } | null;

    if (response.status === 401 && errorBody?.redirectTo) {
      return errorBody.redirectTo;
    }

    throw new Error(
      `Failed to initiate ${isGoogleProvider(provider) ? "Google" : "Microsoft"} account linking`,
    );
  }

  const data: GetAuthLinkUrlResponse | GetOutlookAuthLinkUrlResponse =
    await response.json();

  return data.url;
}
