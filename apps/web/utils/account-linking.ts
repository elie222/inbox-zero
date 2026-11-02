import type { GetAuthLinkUrlResponse } from "@/app/api/google/linking/auth-url/route";
import type { GetOutlookAuthLinkUrlResponse } from "@/app/api/outlook/linking/auth-url/route";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { redirectToSafeUrl } from "@/utils/redirect";

/**
 * Starts linking a mailbox, or reconnecting one when `reconnectEmailAccountId`
 * is set. The desktop app finishes linking in the system browser and returns
 * here without navigating, so callers should clear any loading state when
 * `navigating` is false.
 * @throws Error with a message that is safe to show to the user.
 */
export async function startAccountLinking(
  provider: "google" | "microsoft",
  options?: { reconnectEmailAccountId?: string },
): Promise<{ navigating: boolean }> {
  const desktopApp = getInboxZeroDesktopApp();
  if (desktopApp?.startAccountLink) {
    const result = await desktopApp.startAccountLink(provider, options);
    if (result?.error) throw new Error(result.error);
    return { navigating: false };
  }

  const url = await getAccountLinkingUrl(provider, options);
  redirectToSafeUrl(url, { allowExternal: true });
  return { navigating: true };
}

/**
 * Initiates the OAuth account linking flow for Google or Microsoft.
 * Returns a URL to redirect the user to (OAuth provider, or /logout if
 * the session is stale).
 *
 * Pass `reconnectEmailAccountId` when refreshing an existing mailbox so the
 * provider is asked for that identity and the callback rejects a different one.
 * Omit it when adding a new account.
 * @throws Error if the request fails for a non-recoverable reason. The
 * message is safe to show to the user.
 */
export async function getAccountLinkingUrl(
  provider: "google" | "microsoft",
  options?: { reconnectEmailAccountId?: string },
): Promise<string> {
  const apiProvider = provider === "microsoft" ? "outlook" : "google";
  const query = options?.reconnectEmailAccountId
    ? `?emailAccountId=${encodeURIComponent(options.reconnectEmailAccountId)}`
    : "";

  const response = await fetch(`/api/${apiProvider}/linking/auth-url${query}`, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as {
      error?: string;
      isKnownError?: boolean;
      redirectTo?: string;
    } | null;

    if (response.status === 401 && errorBody?.redirectTo) {
      return errorBody.redirectTo;
    }

    if (errorBody?.isKnownError && errorBody.error) {
      throw new Error(errorBody.error);
    }

    throw new Error(
      `Failed to initiate ${isGoogleProvider(provider) ? "Google" : "Microsoft"} account linking`,
    );
  }

  const data: GetAuthLinkUrlResponse | GetOutlookAuthLinkUrlResponse =
    await response.json();

  return data.url;
}
