const textEncoder = new TextEncoder();

export const DEFAULT_ASSET_PROXY_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AssetProxySignatureInput = {
  assetUrl: string;
  expiresAt: number;
  signingSecret: string;
};

export type SignedAssetProxyUrlOptions = {
  assetUrl: string;
  proxyBaseUrl: string;
  signingSecret?: string;
  ttlSeconds?: number;
  now?: Date | number;
};

export type AssetProxyRewriteOptions = Pick<
  SignedAssetProxyUrlOptions,
  "proxyBaseUrl" | "signingSecret" | "ttlSeconds" | "now"
>;

export async function buildSignedAssetProxyUrl({
  assetUrl,
  proxyBaseUrl,
  signingSecret,
  ttlSeconds = DEFAULT_ASSET_PROXY_TTL_SECONDS,
  now,
}: SignedAssetProxyUrlOptions): Promise<string> {
  if (!isProxyableRemoteUrl(assetUrl)) return assetUrl;

  const proxyUrl = new URL(proxyBaseUrl);
  proxyUrl.searchParams.set("u", assetUrl);

  if (signingSecret) {
    const expiresAt = getExpiresAt({ ttlSeconds, now });
    const signature = await signAssetProxyRequest({
      assetUrl,
      expiresAt,
      signingSecret,
    });

    proxyUrl.searchParams.set("e", expiresAt.toString());
    proxyUrl.searchParams.set("s", signature);
  }

  return proxyUrl.toString();
}

export async function validateAssetProxySignature({
  assetUrl,
  expiresAt,
  signingSecret,
  signature,
}: AssetProxySignatureInput & { signature: string }): Promise<boolean> {
  const expectedSignature = await signAssetProxyRequest({
    assetUrl,
    expiresAt,
    signingSecret,
  });

  return timingSafeEqual(expectedSignature, signature);
}

export function isProxyableRemoteUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

let cachedKey: { secret: string; key: CryptoKey } | null = null;

async function getSigningKey(signingSecret: string): Promise<CryptoKey> {
  if (cachedKey && cachedKey.secret === signingSecret) return cachedKey.key;

  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  cachedKey = { secret: signingSecret, key };
  return key;
}

async function signAssetProxyRequest({
  assetUrl,
  expiresAt,
  signingSecret,
}: AssetProxySignatureInput): Promise<string> {
  const key = await getSigningKey(signingSecret);
  const payload = textEncoder.encode(`${expiresAt}:${assetUrl}`);
  const signature = await crypto.subtle.sign("HMAC", key, payload);

  return toBase64Url(signature);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function getExpiresAt({
  ttlSeconds,
  now,
}: {
  ttlSeconds: number;
  now?: Date | number;
}) {
  const nowMs =
    now instanceof Date
      ? now.getTime()
      : typeof now === "number"
        ? now
        : Date.now();

  return Math.floor(nowMs / 1000) + ttlSeconds;
}

function toBase64Url(value: ArrayBuffer): string {
  const bytes = new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
