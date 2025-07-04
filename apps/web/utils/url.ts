function getGmailBaseUrl(emailAddress?: string | null) {
  return `https://mail.google.com/mail/u/${emailAddress || 0}`;
}

function getOutlookBaseUrl() {
  return "https://outlook.live.com/mail/0";
}

export function getEmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null,
  provider?: string,
) {
  if (provider === "microsoft-entra-id") {
    // Outlook URL format: https://outlook.live.com/mail/0/inbox/id/ENCODED_MESSAGE_ID
    // The message ID needs to be URL-encoded for Outlook
    const encodedMessageId = encodeURIComponent(messageOrThreadId);
    return `${getOutlookBaseUrl()}/inbox/id/${encodedMessageId}`;
  }

  // Default to Gmail format
  return `${getGmailBaseUrl(emailAddress)}/#all/${messageOrThreadId}`;
}

// Keep the old function name for backward compatibility
export function getGmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null,
) {
  return getEmailUrl(messageOrThreadId, emailAddress, "google");
}

export function getGmailSearchUrl(from: string, emailAddress?: string | null) {
  return `${getGmailBaseUrl(
    emailAddress,
  )}/#advanced-search/from=${encodeURIComponent(from)}`;
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
