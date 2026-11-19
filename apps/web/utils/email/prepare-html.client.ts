import { sanitizeMailHtml } from "@inboxzero/mail-ui/sanitize-html";
import { env } from "@/env";
import { getImageProxyBaseUrl } from "@/utils/email/image-proxy-config";
import { stripSentMessageOpenPixels } from "@/utils/email/sent-message-open/sent-message-open";

export const IMAGE_PROXY_BASE_URL = getImageProxyBaseUrl({
  baseUrl: env.NEXT_PUBLIC_BASE_URL,
  externalProxyBaseUrl: env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL,
  useAppRoute: env.NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE,
});
export const IMAGE_PROXY_ORIGIN = IMAGE_PROXY_BASE_URL
  ? new URL(IMAGE_PROXY_BASE_URL).origin
  : null;

const IMAGE_PROXY_RENDER_ROUTE = "/api/email/render-html";
const PREPARED_HTML_MAX_AGE_MS = 5 * 60 * 1000;
const PREPARED_HTML_CACHE_SIZE = 20;
const preparedHtml = new Map<
  string,
  { sourceHtml: string; html: string; preparedAt: number }
>();
const inFlightPreparation = new Map<
  string,
  { sourceHtml: string; promise: Promise<PreparedEmailImages> }
>();

export function sanitizeEmailHtml(html: string) {
  return sanitizeMailHtml(stripSentMessageOpenPixels(html));
}

/**
 * Whether the html has to go through the image proxy before remote images may
 * load. Html that does not is shown as it is, with remote loads still blocked
 * by the frame's policy in case this check misses one.
 */
export function needsImageProxy(sanitizedHtml: string) {
  return Boolean(IMAGE_PROXY_BASE_URL) && hasRemoteAssets(sanitizedHtml);
}

export function getPreparedEmailHtml({
  messageId,
  sourceHtml,
}: {
  messageId: string;
  sourceHtml: string;
}) {
  const prepared = preparedHtml.get(messageId);
  if (
    !prepared ||
    prepared.sourceHtml !== sourceHtml ||
    Date.now() - prepared.preparedAt > PREPARED_HTML_MAX_AGE_MS
  ) {
    if (prepared) preparedHtml.delete(messageId);
    return;
  }

  preparedHtml.delete(messageId);
  preparedHtml.set(messageId, prepared);
  return prepared.html;
}

export function prepareEmailHtml({
  messageId,
  html,
}: {
  messageId: string;
  html: string;
}) {
  const sourceHtml = sanitizeEmailHtml(html);
  return prepareSanitizedEmailHtml({ messageId, sourceHtml });
}

export function prepareSanitizedEmailHtml(input: {
  messageId: string;
  sourceHtml: string;
}) {
  return prepareEmailImages(input).then(({ html }) => html);
}

/**
 * The html to show and whether its remote images may load. They may only
 * when the proxy answered, or when no proxy is configured. If the proxy
 * cannot be reached the html is shown with its remote images still blocked,
 * rather than loading them from the sender.
 */
export function prepareEmailImages({
  messageId,
  sourceHtml,
}: {
  messageId: string;
  sourceHtml: string;
}): Promise<PreparedEmailImages> {
  if (!IMAGE_PROXY_BASE_URL)
    return Promise.resolve({ html: sourceHtml, remoteImagesAllowed: true });
  if (!hasRemoteAssets(sourceHtml))
    return Promise.resolve({ html: sourceHtml, remoteImagesAllowed: false });

  const cached = getPreparedEmailHtml({ messageId, sourceHtml });
  if (cached !== undefined)
    return Promise.resolve({ html: cached, remoteImagesAllowed: true });

  const inFlight = inFlightPreparation.get(messageId);
  if (inFlight?.sourceHtml === sourceHtml) return inFlight.promise;

  const unproxied = { html: sourceHtml, remoteImagesAllowed: false };
  const promise: Promise<PreparedEmailImages> = rewriteHtmlWithProxy(sourceHtml)
    .then((renderedHtml) => {
      if (renderedHtml === undefined) return unproxied;
      const prepared = { html: renderedHtml, remoteImagesAllowed: true };
      if (inFlightPreparation.get(messageId)?.promise !== promise) {
        return prepared;
      }

      preparedHtml.set(messageId, {
        sourceHtml,
        html: renderedHtml,
        preparedAt: Date.now(),
      });
      while (preparedHtml.size > PREPARED_HTML_CACHE_SIZE) {
        const oldestMessageId = preparedHtml.keys().next().value;
        if (!oldestMessageId) break;
        preparedHtml.delete(oldestMessageId);
      }
      return prepared;
    })
    .catch(() => unproxied)
    .finally(() => {
      if (inFlightPreparation.get(messageId)?.promise === promise) {
        inFlightPreparation.delete(messageId);
      }
    });

  inFlightPreparation.set(messageId, { sourceHtml, promise });
  return promise;
}

type PreparedEmailImages = { html: string; remoteImagesAllowed: boolean };

async function rewriteHtmlWithProxy(html: string) {
  const response = await fetch(IMAGE_PROXY_RENDER_ROUTE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ html }),
  });

  if (!response.ok) return;

  const data = await response.json();
  // Without a signing secret the server returns the HTML unchanged, so its
  // images would still point straight at the sender.
  if (data?.remoteAssetsProxied !== true) return;
  return typeof data.html === "string" ? data.html : undefined;
}

const REMOTE_URL_PATTERN = /(?:https?:)?\/\//i;
const LOCAL_URL_PATTERN = /^(?:cid:|data:|blob:|#|$)/i;
// CSS that can fetch something, including through escapes such as `\2f`.
const CSS_LOAD_PATTERN = /url\(|@import|image(?:-set)?\(|\\/i;
const URL_ATTRIBUTES = new Set([
  "action",
  "archive",
  "background",
  "cite",
  "codebase",
  "data",
  "dynsrc",
  "formaction",
  "href",
  "icon",
  "longdesc",
  "lowsrc",
  "manifest",
  "ping",
  "poster",
  "profile",
  "src",
  "usemap",
  "xlink:href",
]);
const remoteAssetChecks = new Map<string, boolean>();

/**
 * Whether the html could load anything from another server, the only reason
 * to route it through the image proxy. Deliberately broader than what the
 * proxy rewrites, so a miss can only cost a wait, never a direct remote load:
 * a URL attribute counts unless it is plainly local, any CSS that can fetch
 * counts, and any other attribute counts if it holds something URL-like.
 */
function hasRemoteAssets(html: string) {
  const cached = remoteAssetChecks.get(html);
  if (cached !== undefined) return cached;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const remote =
    Array.from(parsed.querySelectorAll("style")).some((style) =>
      CSS_LOAD_PATTERN.test(style.textContent ?? ""),
    ) ||
    Array.from(parsed.querySelectorAll("*")).some((element) =>
      Array.from(element.attributes).some((attribute) =>
        attributeMayLoad(element, attribute),
      ),
    );
  remoteAssetChecks.set(html, remote);
  while (remoteAssetChecks.size > PREPARED_HTML_CACHE_SIZE) {
    const oldest = remoteAssetChecks.keys().next().value;
    if (oldest === undefined) break;
    remoteAssetChecks.delete(oldest);
  }
  return remote;
}

function attributeMayLoad(element: Element, { name, value }: Attr) {
  if (name === "style") return CSS_LOAD_PATTERN.test(value);
  if (name === "href" && element.matches("a, area")) return false;
  if (name === "srcset")
    // The sanitizer drops data: srcsets, so no candidate URL holds a comma.
    return value.split(",").some((candidate) => !isLocalUrl(candidate));
  if (URL_ATTRIBUTES.has(name)) return !isLocalUrl(value);
  return REMOTE_URL_PATTERN.test(
    withoutIgnoredUrlCharacters(value).replaceAll("\\", "/"),
  );
}

function isLocalUrl(value: string) {
  return LOCAL_URL_PATTERN.test(withoutIgnoredUrlCharacters(value));
}

// Browsers drop control characters and spaces from URLs, so they cannot hide
// a remote address.
function withoutIgnoredUrlCharacters(value: string) {
  return Array.from(value)
    .filter((character) => character > " ")
    .join("");
}
