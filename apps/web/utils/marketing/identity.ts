export const MARKETING_ANONYMOUS_ID_COOKIE = "iz_marketing_id";
export const MARKETING_ANONYMOUS_ID_MAX_AGE = 60 * 60 * 24 * 365;

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createMarketingAnonymousId(
  randomUUID = globalThis.crypto.randomUUID.bind(globalThis.crypto),
) {
  return randomUUID();
}

export function isValidMarketingAnonymousId(value: string | undefined) {
  return !!value && UUID_V4_REGEX.test(value);
}

export function withCookieValue(
  cookieHeader: string | null,
  name: string,
  value: string,
) {
  const existingCookies = cookieHeader
    ?.split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean);

  const cookies = existingCookies?.filter((cookie) => {
    const cookieName = cookie.split("=")[0]?.trim();
    return cookieName !== name;
  });

  return [...(cookies ?? []), `${name}=${value}`].join("; ");
}
