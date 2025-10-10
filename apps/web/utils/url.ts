function getGmailBaseUrl(emailAddress?: string) {
  if (emailAddress) {
    return `https://mail.google.com/mail/u/?email=${encodeURIComponent(emailAddress)}`;
  }
  return "https://mail.google.com/mail/u/0";
}

function getGmailMessageUrl(messageId: string, emailAddress?: string) {
  if (emailAddress) {
    return `https://mail.google.com/mail/?authuser=${encodeURIComponent(emailAddress)}#all/${messageId}`;
  }
  return `https://mail.google.com/mail/u/0/#all/${messageId}`;
}

function getOutlookBaseUrl() {
  return "https://outlook.live.com/mail/0";
}

const PROVIDER_CONFIG: Record<
  string,
  {
    buildUrl: (messageOrThreadId: string, emailAddress?: string) => string;
    selectId: (messageId: string, threadId: string) => string;
  }
> = {
  microsoft: {
    buildUrl: (messageOrThreadId: string, _emailAddress?: string) => {
      // Working Outlook URL format discovered from real URLs:
      // https://outlook.live.com/mail/0/{FOLDER}/id/{MESSAGE_ID}
      // Examples:
      // - https://outlook.live.com/mail/0/inbox/id/...
      // - https://outlook.live.com/mail/0/archive/id/...
      // - https://outlook.live.com/mail/0/junkemail/id/...
      // NOTE: Don't encode the messageId - it's already URL-encoded from Outlook
      // We do not rely on folder names; default to inbox for fallback links
      return `${getOutlookBaseUrl()}/inbox/id/${messageOrThreadId}`;
    },
    selectId: (_messageId: string, threadId: string) => threadId,
  },
  google: {
    buildUrl: (messageOrThreadId: string, emailAddress?: string) =>
      getGmailMessageUrl(messageOrThreadId, emailAddress),
    selectId: (messageId: string, _threadId: string) => messageId,
  },
  default: {
    buildUrl: (messageOrThreadId: string, emailAddress?: string) =>
      getGmailMessageUrl(messageOrThreadId, emailAddress),
    selectId: (messageId: string, _threadId: string) => messageId,
  },
} as const;

function getProviderConfig(
  provider?: string,
): (typeof PROVIDER_CONFIG)[keyof typeof PROVIDER_CONFIG] {
  return (
    PROVIDER_CONFIG[provider as keyof typeof PROVIDER_CONFIG] ??
    PROVIDER_CONFIG.default
  );
}

export function getEmailUrl(
  messageOrThreadId: string,
  provider?: string,
  emailAddress?: string,
): string {
  const config = getProviderConfig(provider);
  return config.buildUrl(messageOrThreadId, emailAddress);
}

/**
 * Get the appropriate email URL based on provider and available IDs.
 * For Google, uses messageId if available, otherwise threadId.
 * For other providers, uses threadId.
 */
export function getEmailUrlForMessage(
  messageId: string,
  threadId: string,
  provider?: string,
  emailAddress?: string,
) {
  const config = getProviderConfig(provider);
  const idToUse = config?.selectId(messageId, threadId);

  return getEmailUrl(idToUse, provider, emailAddress);
}

// Keep the old function name for backward compatibility
export function getGmailUrl(messageOrThreadId: string, emailAddress?: string) {
  return getEmailUrl(messageOrThreadId, "google", emailAddress);
}

export function getGmailSearchUrl(from: string, emailAddress?: string) {
  return `${getGmailBaseUrl(
    emailAddress,
  )}/#advanced-search/from=${encodeURIComponent(from)}`;
}

export function getGmailBasicSearchUrl(emailAddress: string, query: string) {
  return `${getGmailBaseUrl(emailAddress)}/#search/${encodeURIComponent(query)}`;
}

// export function getGmailCreateFilterUrl(
//   search: string,
//   emailAddress?: string | null,
// ) {
//   return `${getGmailBaseUrl(
//     emailAddress,
//     emailAddress,
//   )}/#create-filter/from=${encodeURIComponent(search)}`;
// }

export function getGmailFilterSettingsUrl(emailAddress?: string) {
  return `${getGmailBaseUrl(emailAddress)}/#settings/filters`;
}
