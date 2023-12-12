function getGmailBaseUrl(emailAddress?: string | null) {
  return `https://mail.google.com/mail/u/${emailAddress || 0}`;
}

export function getGmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null,
) {
  return `${getGmailBaseUrl(emailAddress)}/#all/${messageOrThreadId}`;
}

export function getGmailSearchUrl(
  search: string,
  emailAddress?: string | null,
) {
  return `${getGmailBaseUrl(
    emailAddress,
  )}/#advanced-search/from=${encodeURIComponent(search)}`;
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
