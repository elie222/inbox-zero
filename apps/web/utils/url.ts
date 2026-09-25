import { extractDomainFromEmail } from "@/utils/email";

export function createSearchParams(params: Record<string, unknown>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) continue;
    searchParams.set(key, String(value));
  }

  return searchParams;
}

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

function getOutlookBaseUrl(isPersonalMailbox: boolean) {
  return isPersonalMailbox
    ? "https://outlook.live.com/mail/0"
    : "https://outlook.office.com/mail";
}

// Outlook on the web addresses items by its own id format, which is not the
// Graph id the API returns and cannot be derived from it locally. A hand-built
// `/mail/<folder>/id/<graph id>` link therefore resolves to nothing, and Outlook
// quietly drops the user on the folder with an empty reading pane (INB-365).
// Graph already returns the correct deeplink for each message as `webLink`.
const OUTLOOK_WEB_HOSTS = new Set([
  "outlook.office.com",
  "outlook.office365.com",
  "outlook.live.com",
]);

// This URL is redirected to, so it is validated rather than trusted outright.
// `ispopout=0` is Graph's documented switch for showing the item in the reading
// pane of the full client instead of a standalone popout window.
function toOutlookReadingPaneUrl(webLink?: string | null) {
  if (!webLink) return null;

  let url: URL;
  try {
    url = new URL(webLink);
  } catch {
    return null;
  }

  if (url.protocol !== "https:") return null;
  if (!OUTLOOK_WEB_HOSTS.has(url.hostname.toLowerCase())) return null;

  url.searchParams.set("ispopout", "0");
  return url.toString();
}

// Only the fields a draft deeplink can be built from.
type DraftLinkTarget = {
  id: string;
  threadId?: string | null;
  // Microsoft Graph's `webLink` for the draft.
  externalUrl?: string | null;
};

type ProviderUrlConfig = {
  requiresMessageId: boolean;
  buildUrl: (messageOrThreadId: string, emailAddress?: string | null) => string;
  buildDraftUrl: (
    draft: DraftLinkTarget,
    emailAddress?: string | null,
  ) => string | null;
  selectId: (messageId: string, threadId: string) => string;
  buildSearchUrl: (from: string, emailAddress?: string | null) => string;
};

const GOOGLE_CONFIG: ProviderUrlConfig = {
  requiresMessageId: false,
  buildUrl: (messageOrThreadId: string, emailAddress?: string | null) =>
    getGmailUrlForFragment(`all/${messageOrThreadId}`, emailAddress),
  // Gmail's compose deeplink takes an internal id that cannot be derived from
  // an API id, so the draft itself cannot be opened. Its conversation can, and
  // Drafts is the one label that holds it.
  buildDraftUrl: (draft: DraftLinkTarget, emailAddress?: string | null) =>
    getGmailUrlForFragment(
      `drafts/${encodeURIComponent(draft.threadId || draft.id)}`,
      emailAddress,
    ),
  selectId: (messageId: string, _threadId: string) => messageId,
  buildSearchUrl: (from: string, emailAddress?: string | null) =>
    getGmailUrlForFragment(
      `advanced-search/from=${encodeURIComponent(from)}`,
      emailAddress,
    ),
};

const PROVIDER_CONFIG: Record<string, ProviderUrlConfig> = {
  microsoft: {
    requiresMessageId: true,
    buildUrl: (messageOrThreadId: string, emailAddress?: string | null) => {
      const encodedMessageId = encodeURIComponent(messageOrThreadId);
      return `${getOutlookBaseUrl(isPersonalMicrosoftEmail(emailAddress))}/inbox/id/${encodedMessageId}`;
    },
    buildDraftUrl: (draft: DraftLinkTarget, emailAddress?: string | null) => {
      const readingPaneUrl = toOutlookReadingPaneUrl(draft.externalUrl);
      if (readingPaneUrl) return readingPaneUrl;

      // Nothing here can open the draft itself, but landing in Drafts beats
      // failing the link outright.
      return draft.id
        ? `${getOutlookBaseUrl(isPersonalMicrosoftEmail(emailAddress))}/drafts/id/${encodeURIComponent(draft.id)}`
        : null;
    },
    selectId: (messageId: string, _threadId: string) => messageId,
    buildSearchUrl: (from: string, emailAddress?: string | null) => {
      const query = encodeURIComponent(`from:${from}`);
      return `${getOutlookBaseUrl(isPersonalMicrosoftEmail(emailAddress))}/search/q/${query}`;
    },
  },
  google: GOOGLE_CONFIG,
  default: {
    ...GOOGLE_CONFIG,
    selectId: (_messageId: string, threadId: string) => threadId,
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
 * Takes the draft message itself rather than an id, because Gmail links to the
 * draft's thread while Outlook links to its message. Resolve the draft via
 * `EmailProvider.getDraft` at link time — its message id changes on every edit.
 *
 * Outlook opens the draft itself in the reading pane of the full mail client,
 * via the deeplink Graph reports on the draft.
 * Gmail returns a Drafts conversation URL (composer deeplinks need an internal
 * id the API does not expose).
 */
export function getEmailDraftUrl(
  draft: DraftLinkTarget,
  emailAddress?: string | null,
  provider?: string,
): string | null {
  const config = getProviderConfig(provider);
  return config.buildDraftUrl(draft, emailAddress);
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

export function getGmailFilterSettingsUrl(emailAddress?: string | null) {
  return getGmailUrlForFragment("settings/filters", emailAddress);
}
