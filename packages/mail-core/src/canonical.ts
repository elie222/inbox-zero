export type Sha256Fn = (bytes: Uint8Array) => Promise<Uint8Array>;

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export async function hashCanonical(
  value: unknown,
  sha256: Sha256Fn,
): Promise<string> {
  const encoded = new TextEncoder().encode(canonicalJson(value));
  const digest = await sha256(encoded);
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function webCryptoSha256(bytes: Uint8Array): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (typeof subtle?.digest !== "function") {
    throw new Error("crypto.subtle.digest is required for SHA-256 hashing");
  }
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return new Uint8Array(await subtle.digest("SHA-256", copy));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]),
    );
  }
  return value;
}
