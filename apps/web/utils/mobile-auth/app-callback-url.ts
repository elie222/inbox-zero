export const INBOX_ZERO_APP_SCHEME = "inboxzero";
export const INBOX_ZERO_APP_CALLBACK_HOST = "auth-callback";

const STATE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/u;
const CODE_PATTERN = /^[A-Za-z0-9._~-]{16,256}$/u;
const ERROR_PATTERN = /^[A-Za-z0-9._-]{1,64}$/u;
const ERROR_DESCRIPTION_PATTERN = /^[\w .,+'-]{1,200}$/u;

export function getInboxZeroCustomSchemeCallbackUrl(
  params: Record<string, string | string[] | undefined>,
): string | null {
  const state = firstSearchParam(params.state);
  const code = firstSearchParam(params.code);
  const error = firstSearchParam(params.error);
  const errorDescription = firstSearchParam(params.error_description);

  const url = new URL(
    `${INBOX_ZERO_APP_SCHEME}://${INBOX_ZERO_APP_CALLBACK_HOST}`,
  );

  if (state && STATE_PATTERN.test(state)) {
    url.searchParams.set("state", state);
  }
  if (code && CODE_PATTERN.test(code)) {
    url.searchParams.set("code", code);
  }
  if (error && ERROR_PATTERN.test(error)) {
    url.searchParams.set("error", error);
  }
  if (errorDescription && ERROR_DESCRIPTION_PATTERN.test(errorDescription)) {
    url.searchParams.set("error_description", errorDescription);
  }

  if (!url.searchParams.has("code") && !url.searchParams.has("error")) {
    return null;
  }

  return url.toString();
}

export function isInboxZeroAppCallbackUrl(redirectUrl: string): boolean {
  try {
    const parsedUrl = new URL(redirectUrl);
    const path = `${parsedUrl.hostname}${parsedUrl.pathname}`
      .replace(/^\/+/u, "")
      .replace(/\/+$/u, "");
    return (
      parsedUrl.protocol === `${INBOX_ZERO_APP_SCHEME}:` &&
      path === INBOX_ZERO_APP_CALLBACK_HOST
    );
  } catch {
    return false;
  }
}

function firstSearchParam(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
