import { extractDomainFromEmail } from "@/utils/email";

function getGmailUrlForFragment(
  fragment: string,
  emailAddress?: string | null,
) {
  if (!emailAddress) return `https://mail.google.com/mail/u/0/#${fragment}`;

  return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(emailAddress)}#${fragment}`;
}

// Personal Microsoft accounts (outlook / hotmail / live / msn) sign in at
// outlook.live.com; everything else is an Entra ID / Microsoft 365 mailbox
// served from outlook.office.com. The two hosts route to separate services, so
// pointing a business user at outlook.live.com lands them on the homepage.
// Prefix match covers country variants like outlook.fr, live.co.uk, hotmail.de.
const PERSONAL_MICROSOFT_DOMAIN_PREFIXES = ["outlook.", "hotmail.", "live."];
const PERSONAL_MICROSOFT_DOMAINS = new Set(["msn.com", "passport.com"]);

function isPersonalMicrosoftEmail(emailAddress?: string | null) {
  if (!emailAddress) return false;
  const domain = extractDomainFromEmail(emailAddress).toLowerCase();
  if (!domain) return false;
  if (PERSONAL_MICROSOFT_DOMAINS.has(domain)) return true;
  return PERSONAL_MICROSOFT_DOMAIN_PREFIXES.some((prefix) =>
    domain.startsWith(prefix),
  );
}

function getOutlookBaseUrl(emailAddress?: string | null) {
  return isPersonalMicrosoftEmail(emailAddress)
    ? "https://outlook.live.com/mail/0"
    : "https://outlook.office.com/mail";
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
    buildUrl: (messageOrThreadId: string, emailAddress?: string | null) => {
      const encodedMessageId = encodeURIComponent(messageOrThreadId);
      return `${getOutlookBaseUrl(emailAddress)}/inbox/id/${encodedMessageId}`;
    },
    selectId: (messageId: string, _threadId: string) => messageId,
    buildSearchUrl: (from: string, emailAddress?: string | null) => {
      const query = encodeURIComponent(`from:${from}`);
      return `${getOutlookBaseUrl(emailAddress)}/search/q/${query}`;
    },
  },
  google: {
    requiresMessageId: false,
    buildUrl: (messageOrThreadId: string, emailAddress?: string | null) =>
      getGmailUrlForFragment(`all/${messageOrThreadId}`, emailAddress),
    selectId: (messageId: string, _threadId: string) => messageId,
    buildSearchUrl: (from: string, emailAddress?: string | null) =>
      getGmailUrlForFragment(
        `advanced-search/from=${encodeURIComponent(from)}`,
        emailAddress,
      ),
  },
  default: {
    requiresMessageId: false,
    buildUrl: (messageOrThreadId: string, emailAddress?: string | null) =>
      getGmailUrlForFragment(`all/${messageOrThreadId}`, emailAddress),
    selectId: (_messageId: string, threadId: string) => threadId,
    buildSearchUrl: (from: string, emailAddress?: string | null) =>
      getGmailUrlForFragment(
        `advanced-search/from=${encodeURIComponent(from)}`,
        emailAddress,
      ),
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
  return getGmailUrlForFragment(
    `search/${encodeURIComponent(query)}`,
    emailAddress,
  );
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
  return getGmailUrlForFragment("settings/filters", emailAddress);
}
