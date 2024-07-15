function getGmailBaseUrl(emailAddress?: string | null) {
  return `https://mail.google.com/mail/u/${emailAddress || 0}`;
}

export function getGmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null,
) {
  return `${getGmailBaseUrl(emailAddress)}/#all/${messageOrThreadId}`;
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
//   )}/#create-filter/from=${encodeURIComponent(search)}`;
// }

export function getGmailFilterSettingsUrl(emailAddress?: string | null) {
  return `${getGmailBaseUrl(emailAddress)}/#settings/filters`;
}
