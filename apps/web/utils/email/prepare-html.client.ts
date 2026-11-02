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
  { sourceHtml: string; promise: Promise<string> }
>();

export function sanitizeEmailHtml(html: string) {
  return sanitizeMailHtml(stripSentMessageOpenPixels(html));
}

export function getPreparedEmailHtml({
  messageId,
  sourceHtml,
}: {
  messageId: string;
  sourceHtml: string;
}) {
  if (!hasRemoteAssets(sourceHtml)) return sourceHtml;
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

export function prepareSanitizedEmailHtml({
  messageId,
  sourceHtml,
}: {
  messageId: string;
  sourceHtml: string;
}) {
  if (!IMAGE_PROXY_BASE_URL || !hasRemoteAssets(sourceHtml))
    return Promise.resolve(sourceHtml);

  const cached = getPreparedEmailHtml({ messageId, sourceHtml });
  if (cached !== undefined) return Promise.resolve(cached);

  const inFlight = inFlightPreparation.get(messageId);
  if (inFlight?.sourceHtml === sourceHtml) return inFlight.promise;

  const promise = rewriteHtmlWithProxy(sourceHtml)
    .then((renderedHtml) => {
      if (renderedHtml === undefined) return sourceHtml;
      if (inFlightPreparation.get(messageId)?.promise !== promise) {
        return renderedHtml;
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
      return renderedHtml;
    })
    .catch(() => sourceHtml)
    .finally(() => {
      if (inFlightPreparation.get(messageId)?.promise === promise) {
        inFlightPreparation.delete(messageId);
      }
    });

  inFlightPreparation.set(messageId, { sourceHtml, promise });
  return promise;
}

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
  return typeof data?.html === "string" ? data.html : undefined;
}

const REMOTE_URL_PATTERN = /(?:https?:)?\/\//i;
const remoteAssetChecks = new Map<string, boolean>();

/**
 * Whether the html could load anything from another server, the only reason
 * to route it through the image proxy. Deliberately broader than what the
 * proxy rewrites: any absolute or protocol-relative URL outside a link's
 * target counts, so a miss can only cost a wait, never a direct remote load.
 */
function hasRemoteAssets(html: string) {
  const cached = remoteAssetChecks.get(html);
  if (cached !== undefined) return cached;
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const remote =
    Array.from(parsed.querySelectorAll("style")).some((style) =>
      REMOTE_URL_PATTERN.test(style.textContent ?? ""),
    ) ||
    Array.from(parsed.querySelectorAll("*")).some((element) =>
      Array.from(element.attributes).some(
        (attribute) =>
          !(attribute.name === "href" && element.matches("a, area")) &&
          REMOTE_URL_PATTERN.test(attribute.value),
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
