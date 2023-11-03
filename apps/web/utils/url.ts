export function getGmailUrl(
  messageOrThreadId: string,
  emailAddress?: string | null
) {
  return `https://mail.google.com/mail/u/${
    emailAddress || 0
  }/#all/${messageOrThreadId}`;
}

export function getGmailSearchUrl(
  search: string,
  emailAddress?: string | null
) {
  return `https://mail.google.com/mail/u/${
    emailAddress || 0
  }/#search/${encodeURIComponent(search)}`;
}
