import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import {
  createPinnedLookup,
  type PinnedLookup,
  resolveHostAddresses,
} from "@inboxzero/ssrf-guard/pinned-dns";
import {
  isBlockedHostname,
  isBlockedIpAddress,
  normalizeHostname,
} from "@inboxzero/ssrf-guard/host-policy";

type ResolvedSafeExternalHttpUrl = {
  lookup: PinnedLookup;
  url: URL;
};

export async function createSafeImageProxyFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  let resolved: ResolvedSafeExternalHttpUrl | null;
  try {
    resolved = await resolveSafeExternalHttpUrl(input.toString());
  } catch {
    return new Response("Upstream host lookup failed", { status: 502 });
  }

  if (!resolved) {
    return new Response("Blocked upstream host", { status: 403 });
  }

  return fetchWithPinnedLookup(resolved, init);
}

export function isSafeExternalHttpUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }

    return !isBlockedHostname(parsed.hostname);
  } catch {
    return false;
  }
}

export async function resolveSafeExternalHttpUrl(
  url: string,
): Promise<ResolvedSafeExternalHttpUrl | null> {
  if (!isSafeExternalHttpUrl(url)) return null;

  const parsed = new URL(url);
  const addresses = await resolveHostAddresses(
    normalizeHostname(parsed.hostname),
  );
  if (addresses.some((result) => isBlockedIpAddress(result.address))) {
    return null;
  }

  return { url: parsed, lookup: createPinnedLookup(addresses) };
}

async function fetchWithPinnedLookup(
  resolvedUrl: ResolvedSafeExternalHttpUrl,
  init?: RequestInit,
) {
  if (init?.body != null) {
    throw new TypeError("Image proxy fetch does not support request bodies");
  }

  const method = init?.method || "GET";
  const requestFn =
    resolvedUrl.url.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<Response>((resolve, reject) => {
    const request = requestFn(
      resolvedUrl.url,
      {
        headers: toNodeHeaders(init?.headers),
        lookup: resolvedUrl.lookup,
        method,
        servername:
          resolvedUrl.url.protocol === "https:"
            ? resolvedUrl.url.hostname
            : undefined,
      },
      (upstreamResponse) => {
        const headers = new Headers();

        for (const [key, value] of Object.entries(upstreamResponse.headers)) {
          if (typeof value === "string") {
            headers.set(key, value);
            continue;
          }

          if (Array.isArray(value)) {
            for (const item of value) {
              headers.append(key, item);
            }
          }
        }

        const body =
          method.toUpperCase() === "HEAD"
            ? null
            : (Readable.toWeb(upstreamResponse) as ReadableStream);

        resolve(
          new Response(body, {
            headers,
            status: upstreamResponse.statusCode || 502,
            statusText: upstreamResponse.statusMessage,
          }),
        );
      },
    );

    request.on("error", reject);
    request.end();
  });
}

function toNodeHeaders(headersInit?: HeadersInit) {
  if (!headersInit) return;

  const headers = new Headers(headersInit);
  return Object.fromEntries(headers.entries());
}
