import "server-only";
import { DEFAULT_ASSET_PROXY_TTL_SECONDS } from "@inboxzero/image-proxy/proxy-url";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { rewriteHtmlRemoteAssetUrls } from "./rewrite-html";

let hasWarnedAboutUnsignedImageProxy = false;

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
  const proxyBaseUrl = env.NEXT_PUBLIC_IMAGE_PROXY_BASE_URL;
  const signingSecret = env.IMAGE_PROXY_SIGNING_SECRET;

  if (!proxyBaseUrl) return null;

  if (!signingSecret && !hasWarnedAboutUnsignedImageProxy) {
    hasWarnedAboutUnsignedImageProxy = true;
    logger.warn(
      "Email image proxy is enabled without IMAGE_PROXY_SIGNING_SECRET. External assets will be routed through the configured proxy base URL using unsigned ?u= URLs.",
    );
  }

  return { proxyBaseUrl, signingSecret: signingSecret || undefined };
}
