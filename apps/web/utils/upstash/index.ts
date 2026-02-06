import { Client, type FlowControl, type HeadersInit } from "@upstash/qstash";
import { after } from "next/server";
import { env } from "@/env";
import {
  INTERNAL_API_KEY_HEADER,
  getInternalApiUrl,
} from "@/utils/internal-api";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("upstash");

function getQstashClient() {
  if (!env.QSTASH_TOKEN) return null;
  return new Client({ token: env.QSTASH_TOKEN });
}

export async function publishToQstash<T>(
  path: string,
  body: T,
  flowControl?: FlowControl,
) {
  const client = getQstashClient();
  const url = `${getInternalApiUrl()}${path}`;
  const qstashUrl = resolveQstashTargetUrl(url);

  if (client && qstashUrl) {
    return client.publishJSON({
      url: qstashUrl,
      body,
      flowControl,
      retries: 3,
      headers: {
        "Retry-After": "10", // 10 seconds
      },
    });
  }

  return fallbackPublishToQstash(url, body, undefined, {
    reason: client ? "unreachable-url" : "missing-client",
  });
}

export async function bulkPublishToQstash<T>({
  items,
}: {
  items: {
    url: string;
    body: T;
    flowControl?: FlowControl;
  }[];
}) {
  const client = getQstashClient();
  const qstashItems = client
    ? items.map((item) => {
        const qstashUrl = resolveQstashTargetUrl(item.url);
        if (!qstashUrl) return null;
        return {
          ...item,
          url: qstashUrl,
        };
      })
    : null;

  if (client && qstashItems?.every((item) => item)) {
    return client.batchJSON(
      qstashItems as {
        url: string;
        body: T;
        flowControl?: FlowControl;
      }[],
    );
  }

  for (const item of items) {
    await fallbackPublishToQstash(item.url, item.body, undefined, {
      reason: client ? "unreachable-url" : "missing-client",
    });
  }
}

export async function publishToQstashQueue<T>({
  queueName,
  parallelism,
  url,
  body,
  headers,
}: {
  queueName: string;
  parallelism: number;
  url: string;
  body: T;
  headers?: HeadersInit;
}) {
  const client = getQstashClient();
  const qstashUrl = resolveQstashTargetUrl(url);

  if (client && qstashUrl) {
    try {
      const queue = client.queue({ queueName });
      await queue.upsert({ parallelism });
      return await queue.enqueueJSON({ url: qstashUrl, body, headers });
    } catch (error) {
      logger.error("Failed to publish to Qstash queue", {
        qstashUrl,
        queueName,
        error,
      });
      throw error;
    }
  }

  return fallbackPublishToQstash<T>(url, body, headers, {
    reason: client ? "unreachable-url" : "missing-client",
  });
}

async function fallbackPublishToQstash<T>(
  url: string,
  body: T,
  headers?: HeadersInit,
  options?: {
    reason?: "missing-client" | "unreachable-url";
  },
) {
  if (options?.reason === "unreachable-url") {
    logger.info("Skipping Qstash for unreachable callback URL", { url });
  } else {
    logger.warn("Qstash client not found");
  }

  const internalHeaders = new Headers(
    headers instanceof Headers
      ? headers
      : Array.isArray(headers)
        ? headers
        : headers && typeof headers === "object" && Symbol.iterator in headers
          ? Array.from(headers as Iterable<[string, string]>)
          : headers,
  );
  internalHeaders.set("Content-Type", "application/json");
  internalHeaders.set(INTERNAL_API_KEY_HEADER, env.INTERNAL_API_KEY);

  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: internalHeaders,
        body: JSON.stringify(body),
      });
    } catch (error) {
      logger.error("Fallback QStash fetch failed", { url, error });
    }
  });
}

export async function listQueues() {
  const client = getQstashClient();
  if (client) {
    return await client.queue().list();
  }
  return [];
}

export async function deleteQueue(queueName: string) {
  const client = getQstashClient();
  if (client) {
    logger.info("Deleting queue", { queueName });
    await client.queue({ queueName }).delete();
  }
}

function getPublicApiUrl() {
  const url = env.NEXT_PUBLIC_BASE_URL;
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return `https://${url}`;
  }

  return url;
}

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function resolveQstashTargetUrl(url: string): string | null {
  const internalBaseUrl = normalizeBaseUrl(getInternalApiUrl());
  const publicBaseUrl = normalizeBaseUrl(getPublicApiUrl());

  const qstashUrl = url.startsWith(internalBaseUrl)
    ? `${publicBaseUrl}${url.slice(internalBaseUrl.length)}`
    : url;

  return isReachableByQstash(qstashUrl) ? qstashUrl : null;
}

function isReachableByQstash(url: string): boolean {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return false;
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) return false;

  const hostname = parsedUrl.hostname.toLowerCase();
  if (!hostname) return false;
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname === "::1"
  ) {
    return false;
  }
  if (!hostname.includes(".")) return false;

  return !isPrivateIpv4(hostname);
}

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split(".");
  if (octets.length !== 4) return false;

  const [a, b, c, d] = octets.map((part) => Number(part));
  if ([a, b, c, d].some((part) => Number.isNaN(part))) return false;
  if ([a, b, c, d].some((part) => part < 0 || part > 255)) return false;

  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;

  return false;
}
