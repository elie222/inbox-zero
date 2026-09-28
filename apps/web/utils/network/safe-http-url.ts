import {
  createPinnedLookup,
  type PinnedLookup,
  resolveHostAddresses,
} from "@inboxzero/ssrf-guard/pinned-dns";
import {
  isBlockedIpAddress,
  isInternalHostname,
  normalizeHostname,
} from "@inboxzero/ssrf-guard/host-policy";

type SafeExternalHttpUrlOptions = {
  /**
   * Allow targets that are, or resolve to, private/internal IPs. Off by default.
   *
   * SECURITY: this is an SSRF bypass. Only opt in from a path with a
   * trusted/operator-controlled destination — currently just the webhook sender,
   * gated by the WEBHOOK_ALLOW_PRIVATE_IPS env flag. Callers that handle
   * untrusted input (e.g. unsubscribe links from `List-Unsubscribe` headers, the
   * upstash client) MUST leave this false so private IPs stay blocked.
   * Internal hostnames (localhost, *.local, cloud metadata, single-label names)
   * remain blocked regardless of this option.
   */
  allowPrivateIps?: boolean;
};

type ResolvedSafeExternalHttpUrl = {
  lookup: PinnedLookup;
  url: URL;
};

export function isSafeExternalHttpUrl(
  url: string,
  { allowPrivateIps = false }: SafeExternalHttpUrlOptions = {},
) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname || isInternalHostname(hostname)) return false;

    return allowPrivateIps || !isBlockedIpAddress(hostname);
  } catch {
    return false;
  }
}

export async function resolveSafeExternalHttpUrl(
  url: string,
  { allowPrivateIps = false }: SafeExternalHttpUrlOptions = {},
): Promise<ResolvedSafeExternalHttpUrl | null> {
  if (!isSafeExternalHttpUrl(url, { allowPrivateIps })) return null;

  const parsed = new URL(url);
  const addresses = await resolveHostAddresses(
    normalizeHostname(parsed.hostname),
  );
  if (
    !allowPrivateIps &&
    addresses.some((result) => isBlockedIpAddress(result.address))
  ) {
    return null;
  }

  return { url: parsed, lookup: createPinnedLookup(addresses) };
}
