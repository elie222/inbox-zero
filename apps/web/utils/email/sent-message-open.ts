export const SENT_MESSAGE_OPEN_PATH_PREFIX = "/t/";
export const SENT_MESSAGE_OPEN_TOKEN_LENGTH = 32;
export const SENT_MESSAGE_OPEN_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function isSentMessageOpenToken(token: string) {
  return SENT_MESSAGE_OPEN_TOKEN_PATTERN.test(token);
}

export function sentMessageOpenPath(token: string) {
  return `${SENT_MESSAGE_OPEN_PATH_PREFIX}${token}`;
}

export function isSentMessageOpenPixelUrl(url: string) {
  try {
    const parsed = new URL(url, "https://example.invalid");
    const match = parsed.pathname.match(/^\/t\/([A-Za-z0-9_-]{32})$/);
    return Boolean(match && isSentMessageOpenToken(match[1]));
  } catch {
    return false;
  }
}

export function appendSentMessageOpenPixel(html: string, pixelUrl: string) {
  const pixel = `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:none!important;width:1px;height:1px;border:0;outline:none" />`;
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return `${html}${pixel}`;
}

export function stripSentMessageOpenPixels(html: string) {
  if (!html) return html;
  return html.replace(/<img\b[^>]*\/?>/gi, (tag) => {
    const src = getImgSrc(tag);
    if (!src) return tag;
    return isSentMessageOpenPixelUrl(src.replace(/&amp;/g, "&")) ? "" : tag;
  });
}

export function isSameOriginSentMessageOpenRequest({
  requestUrl,
  referer,
}: {
  requestUrl: string;
  referer: string | null;
}) {
  if (!referer) return false;
  try {
    return new URL(referer).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}

export function describeSentMessageOpen(
  open: {
    firstOpenedAt: Date | string | null;
    lastOpenedAt: Date | string | null;
    openCount: number;
  },
  formatRelative: (date: Date) => string,
) {
  const firstOpenedAt = parseDate(open.firstOpenedAt);
  if (!firstOpenedAt) {
    return { label: "Not opened", detail: "Not opened yet" };
  }

  const lastOpenedAt = parseDate(open.lastOpenedAt) ?? firstOpenedAt;
  if (open.openCount > 1) {
    return {
      label: "Opened",
      detail: `Opened ${open.openCount} times · Last opened ${formatRelative(lastOpenedAt)}`,
    };
  }

  return {
    label: "Opened",
    detail: `Opened ${formatRelative(firstOpenedAt)}`,
  };
}

function parseDate(value: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getImgSrc(tag: string) {
  const quoted = tag.match(/\bsrc\s*=\s*(["'])([^"']*)\1/i)?.[2];
  if (quoted !== undefined) return quoted;
  return tag.match(/\bsrc\s*=\s*([^\s>]+)/i)?.[1];
}
