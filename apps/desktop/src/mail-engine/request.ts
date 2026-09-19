export const EMAIL_ACCOUNT_HEADER = "X-Email-Account-ID";

export function emailAccountIdFromMailApiPath(path: string): string | null {
  const pathname = pathnameOf(path);
  const prefix = "/api/mail/v1/accounts/";
  if (!pathname.startsWith(prefix)) return null;
  const accountId = pathname.slice(prefix.length).split("/")[0];
  if (!accountId) return null;
  try {
    return decodeURIComponent(accountId);
  } catch {
    return null;
  }
}

export function mailApiHeaders(path: string, hasBody: boolean) {
  const accountId = emailAccountIdFromMailApiPath(path);
  return {
    accept: "application/json",
    ...(accountId ? { [EMAIL_ACCOUNT_HEADER]: accountId } : {}),
    ...(hasBody ? { "content-type": "application/json" } : {}),
  };
}

function pathnameOf(path: string) {
  try {
    return new URL(path, "https://mail.invalid").pathname;
  } catch {
    return "";
  }
}
