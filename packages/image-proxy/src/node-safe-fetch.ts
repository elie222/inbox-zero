import { lookup } from "node:dns/promises";
import type {
  LookupAddress,
  LookupAllOptions,
  LookupOneOptions,
} from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import {
  isBlockedHostname,
  normalizeHostname,
  stripIpv6Brackets,
} from "./upstream-host-policy";

type ResolvedAddress = {
  address: string;
  family: 4 | 6;
};

export type ResolvedSafeExternalHttpUrl = {
  lookup: (
    hostname: string,
    options: number | LookupOneOptions | LookupAllOptions | undefined,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => void;
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

    const hostname = normalizeHostname(parsed.hostname);
    if (!hostname) return false;
    if (isBlockedHostname(hostname)) return false;

    const ipAddress = stripIpv6Brackets(hostname);
    if (isIP(ipAddress)) return true;

    if (!hostname.includes(".")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function resolveSafeExternalHttpUrl(
  url: string,
): Promise<ResolvedSafeExternalHttpUrl | null> {
  if (!isSafeExternalHttpUrl(url)) return null;

  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  const ipAddress = stripIpv6Brackets(hostname);
  const ipVersion = isIP(ipAddress);

  if (ipVersion === 4 || ipVersion === 6) {
    return {
      url: parsed,
      lookup: createPinnedLookup([
        { address: ipAddress, family: ipVersion as 4 | 6 },
      ]),
    };
  }

  const resolvedAddresses = await resolvePublicAddresses(hostname);
  if (!resolvedAddresses) return null;

  return {
    url: parsed,
    lookup: createPinnedLookup(resolvedAddresses),
  };
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

async function resolvePublicAddresses(
  hostname: string,
): Promise<ResolvedAddress[] | null> {
  const results = await lookup(hostname, {
    all: true,
    verbatim: true,
  });

  if (!results.length) {
    throw Object.assign(new Error("DNS lookup returned no results"), {
      code: "ENOTFOUND",
    });
  }

  const addresses = results.map((result) => ({
    address: stripIpv6Brackets(result.address),
    family: result.family as 4 | 6,
  }));

  if (addresses.some((result) => isResolvedAddressPrivate(result.address))) {
    return null;
  }

  return addresses;
}

function isResolvedAddressPrivate(address: string) {
  return isBlockedHostname(address);
}

function createPinnedLookup(addresses: ResolvedAddress[]) {
  let nextIndex = 0;

  return (
    _hostname: string,
    options: number | LookupOneOptions | LookupAllOptions | undefined,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    const normalizedOptions =
      typeof options === "number" ? { family: options } : options || {};
    const requestedFamily = normalizedOptions.family;

    const matchingAddresses =
      requestedFamily === 4 || requestedFamily === 6
        ? addresses.filter((result) => result.family === requestedFamily)
        : addresses;

    if (!matchingAddresses.length) {
      callback(
        Object.assign(new Error("No safe address available"), {
          code: "ENOTFOUND",
        }),
        "",
      );
      return;
    }

    if ("all" in normalizedOptions && normalizedOptions.all) {
      callback(
        null,
        matchingAddresses.map((result) => ({
          address: result.address,
          family: result.family,
        })),
      );
      return;
    }

    const selected = matchingAddresses[nextIndex % matchingAddresses.length];
    nextIndex += 1;

    callback(null, selected.address, selected.family);
  };
}
