import type { MeetingProvider } from "@/utils/meetings/parse-meeting-request";

export type AccountProvider = "google" | "microsoft";

export interface MeetingLinkResult {
  provider: MeetingProvider;
  joinUrl: string;
  conferenceId?: string;
  conferenceData?: any; // Provider-specific data to attach to calendar event
}

/**
 * Get available meeting providers for an account
 */
export function getAvailableProviders(
  accountProvider: AccountProvider,
): MeetingProvider[] {
  if (accountProvider === "google") {
    return ["google-meet", "zoom"];
  }
  if (accountProvider === "microsoft") {
    return ["teams", "zoom"];
  }
  return [];
}

/**
 * Validate if a meeting provider is available for an account
 */
export function validateProviderForAccount(
  provider: MeetingProvider | null,
  accountProvider: AccountProvider,
): {
  valid: boolean;
  resolvedProvider: MeetingProvider;
  needsFallback: boolean;
} {
  // If no provider specified, use native default
  if (!provider) {
    return {
      valid: true,
      resolvedProvider: accountProvider === "google" ? "google-meet" : "teams",
      needsFallback: false,
    };
  }

  // Check if provider is available for this account
  const availableProviders = getAvailableProviders(accountProvider);

  if (provider === "teams" && accountProvider === "google") {
    // Teams not available for Google accounts
    return {
      valid: false,
      resolvedProvider: "google-meet",
      needsFallback: true,
    };
  }

  if (provider === "google-meet" && accountProvider === "microsoft") {
    // Google Meet not available for Microsoft accounts
    return {
      valid: false,
      resolvedProvider: "teams",
      needsFallback: true,
    };
  }

  if (provider === "zoom") {
    // Zoom requires separate integration (not yet implemented)
    return {
      valid: false,
      resolvedProvider: accountProvider === "google" ? "google-meet" : "teams",
      needsFallback: true,
    };
  }

  if (provider === "none") {
    // No meeting link requested - this is valid
    return {
      valid: true,
      resolvedProvider: "none",
      needsFallback: false,
    };
  }

  // Provider is valid and available
  return {
    valid: availableProviders.includes(provider),
    resolvedProvider: provider,
    needsFallback: false,
  };
}
