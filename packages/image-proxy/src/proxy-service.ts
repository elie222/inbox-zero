import {
  isProxyableRemoteUrl,
  validateAssetProxySignature,
} from "./proxy-url.js";

const CACHEABLE_CONTENT_TYPES = [
  "application/font-sfnt",
  "application/font-woff",
  "application/font-woff2",
  "font/",
  "image/",
];
const HOP_BY_HOP_HEADERS = new Set([
  "alt-svc",
  "connection",
  "content-length",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "set-cookie",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);
const MAX_REDIRECTS = 3;
const DEFAULT_UNSIGNED_PROXY_TTL_SECONDS = 60 * 60;

export type ImageProxyConfig = {
  signingSecret?: string;
};

export type ImageProxyCache = {
  match(key: Request): Promise<Response | undefined>;
  put(key: Request, value: Response): Promise<void> | void;
};

export type ImageProxyExecutionContext = {
  waitUntil(promise: Promise<unknown>): void;
};

export type ImageProxyLogger = {
  warn(message: string, context?: Record<string, unknown>): void;
};

export async function handleImageProxyRequest(
  request: Request,
  config: ImageProxyConfig,
  options?: {
    cache?: ImageProxyCache;
    executionContext?: ImageProxyExecutionContext;
    fetchImpl?: typeof fetch;
    logger?: ImageProxyLogger;
  },
) {
  const url = new URL(request.url);

  if (url.pathname === "/health") {
    return new Response("ok");
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const assetUrl = url.searchParams.get("u");
  const expiresAtParam = url.searchParams.get("e");
  const signature = url.searchParams.get("s");

  if (!assetUrl) {
    return new Response("Missing asset URL", { status: 400 });
  }

  if (!isProxyableRemoteUrl(assetUrl)) {
    return new Response("Unsupported asset URL", { status: 400 });
  }

  const upstreamUrl = new URL(assetUrl);
  if (isBlockedHostname(upstreamUrl.hostname)) {
    return new Response("Blocked upstream host", { status: 403 });
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  let ttlSeconds = DEFAULT_UNSIGNED_PROXY_TTL_SECONDS;

  if (config.signingSecret) {
    if (!expiresAtParam || !signature) {
      return new Response("Missing proxy signature", { status: 400 });
    }

    const expiresAt = Number.parseInt(expiresAtParam, 10);
    if (!Number.isFinite(expiresAt) || expiresAt <= nowSeconds) {
      return new Response("Expired proxy URL", { status: 410 });
    }

    const isValidSignature = await validateAssetProxySignature({
      assetUrl,
      expiresAt,
      signature,
      signingSecret: config.signingSecret,
    });

    if (!isValidSignature) {
      return new Response("Invalid proxy signature", { status: 403 });
    }

    ttlSeconds = Math.max(0, expiresAt - nowSeconds);
  }

  const cache = options?.cache;
  const cacheKey = new Request(request.url, { method: "GET" });
  if (cache) {
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) return cachedResponse;
  }

  const fetchImpl = options?.fetchImpl || fetch;
  const upstreamResponse = await fetchUpstreamAsset(
    assetUrl,
    request.method,
    MAX_REDIRECTS,
    fetchImpl,
    options?.logger,
  );

  if (!upstreamResponse.ok) {
    return new Response("Upstream fetch failed", {
      status: upstreamResponse.status,
    });
  }

  const contentType = upstreamResponse.headers.get("content-type") || "";
  if (!isCacheableContentType(contentType)) {
    upstreamResponse.body?.cancel();
    return new Response("Unsupported content type", { status: 415 });
  }

  const responseHeaders = copyResponseHeaders(upstreamResponse.headers);
  responseHeaders.set(
    "Cache-Control",
    `public, max-age=${Math.min(ttlSeconds, 3600)}, s-maxage=${ttlSeconds}`,
  );
  responseHeaders.set("Content-Type", contentType);
  responseHeaders.set("Cross-Origin-Resource-Policy", "same-site");
  responseHeaders.set("Referrer-Policy", "no-referrer");
  responseHeaders.set("X-Content-Type-Options", "nosniff");

  const proxiedResponse = new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers: responseHeaders,
  });

  if (cache && ttlSeconds > 0 && request.method === "GET") {
    const putPromise = Promise.resolve(
      cache.put(cacheKey, proxiedResponse.clone()),
    );
    options?.executionContext?.waitUntil(putPromise);
  }

  return proxiedResponse;
}

async function fetchUpstreamAsset(
  assetUrl: string,
  method: string,
  redirectsRemaining: number,
  fetchImpl: typeof fetch,
  logger?: ImageProxyLogger,
  redirectChain: string[] = [],
  initialAssetUrl = assetUrl,
): Promise<Response> {
  const upstreamResponse = await fetchImpl(assetUrl, {
    method,
    headers: {
      Accept:
        "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      "User-Agent": "Inbox Zero Image Proxy",
    },
    redirect: "manual",
  });

  if (isRedirectResponse(upstreamResponse.status)) {
    if (redirectsRemaining <= 0) {
      upstreamResponse.body?.cancel();
      logger?.warn("Image proxy redirect limit exceeded", {
        initialUrl: sanitizeUrlForLogs(initialAssetUrl),
        method,
        redirectChain,
      });
      return new Response("Too many redirects", { status: 508 });
    }

    const location = upstreamResponse.headers.get("location");
    upstreamResponse.body?.cancel();

    if (!location) {
      return new Response("Redirect missing location", { status: 502 });
    }

    let redirectedUrl: URL;
    try {
      redirectedUrl = new URL(location, assetUrl);
    } catch {
      logger?.warn("Image proxy redirect target is invalid", {
        initialUrl: sanitizeUrlForLogs(initialAssetUrl),
        method,
        redirectChain,
        location: sanitizeLocationForLogs(location),
      });
      return new Response("Redirect target is invalid", { status: 502 });
    }

    if (!isProxyableRemoteUrl(redirectedUrl.toString())) {
      logger?.warn("Image proxy redirect target has unsupported scheme", {
        initialUrl: sanitizeUrlForLogs(initialAssetUrl),
        method,
        redirectChain: [...redirectChain, sanitizeUrlForLogs(redirectedUrl)],
      });
      return new Response("Unsupported redirect target", { status: 400 });
    }

    if (isBlockedHostname(redirectedUrl.hostname)) {
      logger?.warn("Image proxy redirect target is blocked", {
        initialUrl: sanitizeUrlForLogs(initialAssetUrl),
        method,
        redirectChain: [...redirectChain, sanitizeUrlForLogs(redirectedUrl)],
      });
      return new Response("Blocked redirect target", { status: 403 });
    }

    return fetchUpstreamAsset(
      redirectedUrl.toString(),
      method,
      redirectsRemaining - 1,
      fetchImpl,
      logger,
      [...redirectChain, sanitizeUrlForLogs(redirectedUrl)],
      initialAssetUrl,
    );
  }

  return upstreamResponse;
}

function copyResponseHeaders(source: Headers) {
  const headers = new Headers();

  source.forEach((value, key) => {
    if (HOP_BY_HOP_HEADERS.has(key.toLowerCase())) return;
    headers.set(key, value);
  });

  return headers;
}

function isCacheableContentType(contentType: string) {
  const normalized = contentType.toLowerCase();
  return CACHEABLE_CONTENT_TYPES.some((prefix) =>
    normalized.startsWith(prefix),
  );
}

function isRedirectResponse(status: number) {
  return status >= 300 && status < 400;
}

function sanitizeUrlForLogs(value: string | URL) {
  const url = typeof value === "string" ? new URL(value) : value;
  return `${url.origin}${url.pathname}`;
}

function sanitizeLocationForLogs(value: string) {
  try {
    return sanitizeUrlForLogs(value);
  } catch {
    return value.slice(0, 200);
  }
}

function isBlockedHostname(hostname: string) {
  const normalized = hostname
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  const isIpv6Literal = normalized.includes(":");

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized === "0.0.0.0" ||
    normalized.startsWith("0.") ||
    normalized === "::1" ||
    normalized === "::" ||
    (isIpv6Literal && normalized.startsWith("fc")) ||
    (isIpv6Literal && normalized.startsWith("fd")) ||
    (isIpv6Literal && normalized.startsWith("fe80")) ||
    (isIpv6Literal && normalized.includes("::ffff:")) ||
    normalized.startsWith("127.") ||
    normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") ||
    normalized.startsWith("169.254.") ||
    normalized.startsWith("100.64.") ||
    normalized === "metadata.google.internal" ||
    normalized === "metadata.gcp.internal" ||
    isPrivate172Range(normalized) ||
    isPrivate100Range(normalized)
  );
}

function isPrivate172Range(hostname: string) {
  const match = hostname.match(/^172\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number.parseInt(match[1], 10);
  return secondOctet >= 16 && secondOctet <= 31;
}

function isPrivate100Range(hostname: string) {
  const match = hostname.match(/^100\.(\d{1,3})\./);
  if (!match) return false;

  const secondOctet = Number.parseInt(match[1], 10);
  return secondOctet >= 64 && secondOctet <= 127;
}
