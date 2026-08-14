const OAUTH_STATE_COOKIE_NAMES = new Set([
  "__Secure-better-auth.oauth_state",
  "better-auth.oauth_state",
]);

export function getSetCookieValues(headers: Headers): string[] {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) return cookies;
  const combined = headers.get("set-cookie");
  return combined ? splitSetCookieHeader(combined) : [];
}

export function getOAuthStateCookieValue(headers: Headers): string | null {
  for (const cookie of getSetCookieValues(headers)) {
    const [nameValue] = cookie.split(";", 1);
    const [name, ...valueParts] = (nameValue || "").split("=");
    if (OAUTH_STATE_COOKIE_NAMES.has(name ?? "")) {
      return valueParts.join("=") || null;
    }
  }

  return null;
}

export function splitSetCookieHeader(setCookie: string): string[] {
  const parts: string[] = [];
  let buffer = "";
  let i = 0;

  while (i < setCookie.length) {
    const char = setCookie[i];
    if (char === ",") {
      const recent = buffer.toLowerCase();
      const hasExpires = recent.includes("expires=");
      const hasGmt = /gmt/i.test(recent);

      if (hasExpires && !hasGmt) {
        buffer += char;
        i += 1;
        continue;
      }

      if (buffer.trim()) {
        parts.push(buffer.trim());
        buffer = "";
      }

      i += 1;
      if (setCookie[i] === " ") i += 1;
      continue;
    }

    buffer += char;
    i += 1;
  }

  if (buffer.trim()) {
    parts.push(buffer.trim());
  }

  return parts;
}
