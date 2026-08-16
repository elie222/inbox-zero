import DOMPurify from "dompurify";
import { env } from "@/env";
import { getImageProxyBaseUrl } from "@/utils/email/image-proxy-config";

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
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
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

export function prepareSanitizedEmailHtml({
  messageId,
  sourceHtml,
}: {
  messageId: string;
  sourceHtml: string;
}) {
  if (!IMAGE_PROXY_BASE_URL) return Promise.resolve(sourceHtml);

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
