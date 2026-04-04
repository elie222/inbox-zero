type ImageProxyConfigInput = {
  baseUrl?: string;
  externalProxyBaseUrl?: string;
  useAppRoute?: boolean;
};

const APP_IMAGE_PROXY_PATH = "/api/image-proxy";

export function getImageProxyBaseUrl({
  baseUrl,
  externalProxyBaseUrl,
  useAppRoute,
}: ImageProxyConfigInput) {
  if (useAppRoute) {
    if (!baseUrl) return null;
    try {
      return new URL(APP_IMAGE_PROXY_PATH, baseUrl).toString();
    } catch {
      return null;
    }
  }

  return externalProxyBaseUrl || null;
}
