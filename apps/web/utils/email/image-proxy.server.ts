import "server-only";
import { DEFAULT_ASSET_PROXY_TTL_SECONDS } from "@inboxzero/image-proxy/proxy-url";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { getImageProxyBaseUrl } from "./image-proxy-config";
import { rewriteHtmlRemoteAssetUrls } from "./rewrite-html";

let hasWarnedAboutUnsignedImageProxy = false;
let hasWarnedAboutDisabledAppRouteImageProxy = false;
let hasWarnedAboutDisabledProductionImageProxy = false;

export async function rewriteHtmlForImageProxy(html: string, logger: Logger) {
  const config = getImageProxyConfig(logger);
  if (!config || !html) return html;

  return rewriteHtmlRemoteAssetUrls(html, {
    proxyBaseUrl: config.proxyBaseUrl,
    signingSecret: config.signingSecret,
    ttlSeconds: DEFAULT_ASSET_PROXY_TTL_SECONDS,
  });
}

function getImageProxyConfig(logger: Logger) {
  const useAppRoute = env.NEXT_PUBLIC_IMAGE_PROXY_USE_APP_ROUTE;
  const proxyBaseUrl = getImageProxyBaseUrl({
    baseUrl: env.NEXT_PUBLIC_BASE_URL,
    externalProxyBaseUrl: env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL,
    useAppRoute,
  });
  const signingSecret = env.IMAGE_PROXY_SIGNING_SECRET;

  if (!proxyBaseUrl) return null;

  if (!signingSecret) {
    if (useAppRoute) {
      if (!hasWarnedAboutDisabledAppRouteImageProxy) {
        hasWarnedAboutDisabledAppRouteImageProxy = true;
        logger.warn(
          "Email image proxy app route is disabled because IMAGE_PROXY_SIGNING_SECRET is missing.",
        );
      }

      return null;
    }

    if (env.NODE_ENV === "production") {
      if (!hasWarnedAboutDisabledProductionImageProxy) {
        hasWarnedAboutDisabledProductionImageProxy = true;
        logger.warn(
          "Email image proxy is disabled in production because IMAGE_PROXY_SIGNING_SECRET is missing.",
        );
      }

      return null;
    }

    if (!hasWarnedAboutUnsignedImageProxy) {
      hasWarnedAboutUnsignedImageProxy = true;
      logger.warn(
        "Email image proxy is enabled without IMAGE_PROXY_SIGNING_SECRET outside production. External assets will be routed through the configured proxy base URL using unsigned ?u= URLs.",
      );
    }
  }

  return { proxyBaseUrl, signingSecret: signingSecret || undefined };
}
