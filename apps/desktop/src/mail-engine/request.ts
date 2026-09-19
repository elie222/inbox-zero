import type { MailHttpRequestFn } from "@inboxzero/mail-core/protocol/backend-adapter";

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

export function createOriginMailRequest(input: {
  origin: string;
  cookieHeader?: (url: string) => Promise<string> | string;
}): MailHttpRequestFn {
  return async ({ method, path, body, signal }) => {
    const url = new URL(path, input.origin).toString();
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const cookieHeader = input.cookieHeader
      ? await input.cookieHeader(url)
      : "";
    const response = await fetch(url, {
      method,
      headers: {
        ...mailApiHeaders(path, payload !== undefined),
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
      body: payload,
      signal,
    });
    const json = await response.json().catch(() => null);
    return { status: response.status, json };
  };
}

function pathnameOf(path: string) {
  try {
    return new URL(path, "https://mail.invalid").pathname;
  } catch {
    return "";
  }
}
