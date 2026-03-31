function getGmailBaseUrl(emailAddress?: string | null) {
  return `https://mail.google.com/mail/u/${emailAddress || 0}`;
}

function getOutlookBaseUrl() {
  return "https://outlook.live.com/mail/0";
}

const PROVIDER_CONFIG: Record<
  string,
  {
    requiresMessageId: boolean;
    buildUrl: (
      messageOrThreadId: string,
      emailAddress?: string | null,
    ) => string;
    selectId: (messageId: string, threadId: string) => string;
    buildSearchUrl: (from: string, emailAddress?: string | null) => string;
  }
> = {
  microsoft: {
    requiresMessageId: true,
    buildUrl: (messageOrThreadId: string, _emailAddress?: string | null) => {
      // Outlook URL format: https://outlook.live.com/mail/0/inbox/id/ENCODED_MESSAGE_ID
      // The message ID needs to be URL-encoded for Outlook
      const encodedMessageId = encodeURIComponent(messageOrThreadId);
      return `${getOutlookBaseUrl()}/inbox/id/${encodedMessageId}`;
    },
    selectId: (messageId: string, _threadId: string) => messageId,
    buildSearchUrl: (from: string, _emailAddress?: string | null) => {
      const query = encodeURIComponent(`from:${from}`);
      return `${getOutlookBaseUrl()}/search/q/${query}`;
    },
  },
  google: {
    requiresMessageId: false,
    buildUrl: (messageOrThreadId: string, emailAddress?: string | null) =>
      `${getGmailBaseUrl(emailAddress)}/#all/${messageOrThreadId}`,
    selectId: (messageId: string, _threadId: string) => messageId,
    buildSearchUrl: (from: string, emailAddress?: string | null) =>
      `${getGmailBaseUrl(
        emailAddress,
      )}/#advanced-search/from=${encodeURIComponent(from)}`,
  },
  default: {
    requiresMessageId: false,
    buildUrl: (messageOrThreadId: string, emailAddress?: string | null) =>
      `${getGmailBaseUrl(emailAddress)}/#all/${messageOrThreadId}`,
    selectId: (_messageId: string, threadId: string) => threadId,
    buildSearchUrl: (from: string, emailAddress?: string | null) =>
      `${getGmailBaseUrl(
        emailAddress,
      )}/#advanced-search/from=${encodeURIComponent(from)}`,
  },
} as const;

function getProviderConfig(
  provider?: string,
): (typeof PROVIDER_CONFIG)[keyof typeof PROVIDER_CONFIG] {
  if (!provider) return PROVIDER_CONFIG.default;
  return PROVIDER_CONFIG[provider] ?? PROVIDER_CONFIG.default;
}

export function getEmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null,
  provider?: string,
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
  emailAddress?: string | null,
  provider?: string,
) {
  const config = getProviderConfig(provider);
  const idToUse = config?.selectId(messageId, threadId);

  return getEmailUrl(idToUse, emailAddress, provider);
}

export function getEmailUrlForOptionalMessage({
  messageId,
  threadId,
  emailAddress,
  provider,
}: {
  messageId?: string | null;
  threadId?: string | null;
  emailAddress?: string | null;
  provider?: string;
}) {
  const config = getProviderConfig(provider);
  if (config.requiresMessageId && !messageId) return null;

  const resolvedMessageId = messageId || threadId;
  const resolvedThreadId = threadId || messageId;
  if (!resolvedMessageId || !resolvedThreadId) return null;

  return getEmailUrlForMessage(
    resolvedMessageId,
    resolvedThreadId,
    emailAddress,
    provider,
  );
}

// Keep the old function name for backward compatibility
export function getGmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null,
) {
  return getEmailUrl(messageOrThreadId, emailAddress, "google");
}

export function getGmailSearchUrl(from: string, emailAddress?: string | null) {
  const config = getProviderConfig("google");
  return config.buildSearchUrl(from, emailAddress);
}

export function getEmailSearchUrl(
  from: string,
  emailAddress?: string | null,
  provider?: string,
) {
  const config = provider ? PROVIDER_CONFIG[provider] : undefined;
  if (!config)
    return PROVIDER_CONFIG.default.buildSearchUrl(from, emailAddress);
  return config.buildSearchUrl(from, emailAddress);
}

export function getGmailBasicSearchUrl(emailAddress: string, query: string) {
  return `${getGmailBaseUrl(emailAddress)}/#search/${encodeURIComponent(
    query,
  )}`;
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

export function getGmailFilterSettingsUrl(emailAddress?: string | null) {
  return `${getGmailBaseUrl(emailAddress)}/#settings/filters`;
}
