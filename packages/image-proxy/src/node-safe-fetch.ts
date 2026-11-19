import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import {
  type ResolvedSafeExternalHttpUrl,
  resolveSafeExternalHttpUrl,
} from "@inboxzero/network/safe-url";

// The Response constructor throws if these statuses are given a body.
const NULL_BODY_STATUSES = new Set([204, 205, 304]);
// Leaves headroom inside the route's 15s maxDuration to answer with a 504.
const UPSTREAM_IDLE_TIMEOUT_MS = 10_000;

export async function createSafeImageProxyFetch(
  input: string | URL,
  init?: RequestInit,
): Promise<Response> {
  let resolved: ResolvedSafeExternalHttpUrl | null;
  try {
    resolved = await resolveSafeExternalHttpUrl(input.toString());
  } catch {
    return new Response("Upstream host lookup failed", {
      status: 502,
      statusText: "Upstream host lookup failed",
    });
  }

  if (!resolved) {
    return new Response("Blocked upstream host", {
      status: 403,
      statusText: "Blocked upstream host",
    });
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

  return new Promise<Response>((resolve) => {
    const request = requestFn(
      resolvedUrl.url,
      {
        headers: toNodeHeaders(init?.headers),
        lookup: resolvedUrl.lookup,
        method,
        timeout: UPSTREAM_IDLE_TIMEOUT_MS,
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

        const status = upstreamResponse.statusCode || 502;
        const hasBody =
          method.toUpperCase() !== "HEAD" && !NULL_BODY_STATUSES.has(status);
        if (!hasBody) upstreamResponse.resume();

        resolve(
          new Response(
            hasBody
              ? (Readable.toWeb(upstreamResponse) as ReadableStream)
              : null,
            {
              headers,
              status,
              statusText: upstreamResponse.statusMessage,
            },
          ),
        );
      },
    );

    // A slow, down, or misconfigured image host is expected, so network
    // failures become gateway responses rather than thrown errors.
    request.on("timeout", () => {
      request.destroy(
        Object.assign(new Error("Upstream request timed out"), {
          code: "ETIMEDOUT",
        }),
      );
    });
    request.on("error", (error: NodeJS.ErrnoException) => {
      const code = error.code || "UNKNOWN";
      resolve(
        new Response("Upstream request failed", {
          status: code === "ETIMEDOUT" ? 504 : 502,
          statusText: `Upstream request failed: ${code}`,
        }),
      );
    });
    request.end();
  });
}

function toNodeHeaders(headersInit?: HeadersInit) {
  if (!headersInit) return;

  const headers = new Headers(headersInit);
  return Object.fromEntries(headers.entries());
}
