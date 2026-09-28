import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import {
  type ResolvedSafeExternalHttpUrl,
  resolveSafeExternalHttpUrl,
} from "@inboxzero/network/safe-url";

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
