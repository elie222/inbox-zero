import { normalizeInternalPath } from "@/utils/path";

type SafeRedirectUrlOptions = {
  allowExternal?: boolean;
  fallbackUrl?: `/${string}`;
};

export function buildRedirectUrl(
  basePath: string,
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  if (!searchParams) return basePath;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const v of value) params.append(key, v);
    } else {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

export function buildLoginRedirectUrl(nextPath: string | null | undefined) {
  const normalizedNextPath = normalizeInternalPath(nextPath);
  if (!normalizedNextPath) return "/login";

  return buildRedirectUrl("/login", { next: normalizedNextPath });
}

export function getSafeRedirectUrl(
  redirectUrl: string | null | undefined,
  options: SafeRedirectUrlOptions = {},
) {
  const fallbackUrl = options.fallbackUrl ?? "/";
  const internalPath = normalizeInternalPath(redirectUrl);
  if (internalPath) return internalPath;
  if (!redirectUrl) return fallbackUrl;

  const currentOrigin = getCurrentOrigin();
  try {
    const parsedUrl = new URL(redirectUrl);
    if (currentOrigin && parsedUrl.origin === currentOrigin) {
      return (
        normalizeInternalPath(
          `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`,
        ) ?? fallbackUrl
      );
    }

    if (!options.allowExternal) return fallbackUrl;
    if (
      parsedUrl.protocol === "https:" ||
      isDevelopmentLocalHttpUrl(parsedUrl)
    ) {
      return parsedUrl.toString();
    }
  } catch {
    return fallbackUrl;
  }

  return fallbackUrl;
}

export function redirectToSafeUrl(
  redirectUrl: string | null | undefined,
  options: SafeRedirectUrlOptions = {},
) {
  window.location.assign(getSafeRedirectUrl(redirectUrl, options));
}

function getCurrentOrigin() {
  if (typeof window === "undefined") return null;
  return window.location.origin;
}

function isDevelopmentLocalHttpUrl(url: URL) {
  return (
    process.env.NODE_ENV !== "production" &&
    url.protocol === "http:" &&
    (url.hostname === "localhost" ||
      url.hostname === "127.0.0.1" ||
      url.hostname === "[::1]")
  );
}
