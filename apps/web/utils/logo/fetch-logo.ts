import { createSafeImageProxyFetch } from "@inboxzero/image-proxy/node-safe-fetch";

// Company logo lookup: a chain of providers tried in order until one
// returns a usable image. All requests go through the SSRF-guarded safe
// fetch (blocked-host policy + DNS resolution pinned to public addresses),
// because the domain comes from contact data.
const ATTEMPT_TIMEOUT_MS = 4000;
// Providers × 4s can exceed the route budget — stop starting new attempts
// past this point and return not-found instead of timing out the request
const TOTAL_BUDGET_MS = 12_000;
const MAX_REDIRECT_HOPS = 3;
// Aggregators (Google s2) serve placeholder/default icons for unknown
// domains — anything this small from them is a placeholder, fall through.
// The company's own site has no placeholder problem: a 200 there is a real
// icon even when it's a few hundred bytes (e.g. a 16px favicon), so its
// floor only rejects empty/corrupt responses.
const MIN_AGGREGATOR_IMAGE_BYTES = 600;
const MIN_OWN_SITE_IMAGE_BYTES = 100;
// Real logos/favicons are tiny; a larger response is either not a logo or a
// resource-exhaustion attempt. Cap what we buffer into memory.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type FetchedLogo = {
  body: ArrayBuffer;
  contentType: string;
};

// A provider family the chain can be restricted to ("site" covers the
// company's own apple-touch-icon/favicon candidates) — lets the logo picker
// offer one image per source instead of only the chain's first hit
export const LOGO_SOURCES = [
  "logo-dev",
  "duckduckgo",
  "site",
  "google",
] as const;
export type LogoSource = (typeof LOGO_SOURCES)[number];

// One provider attempt's outcome, reported through onAttempt so the route
// can answer "why is there no logo for this domain?" (debug view + logs)
export type LogoAttempt = {
  url: string;
  outcome:
    | "hit"
    | "bad-status"
    | "not-an-image"
    | "svg-rejected"
    | "too-small-or-capped"
    | "timeout"
    | "error"
    | "skipped-unresponsive-host"
    | "skipped-budget";
  status?: number;
  contentType?: string;
  bytes?: number;
};

// Hostname shape only — the safe fetch enforces the blocked-host policy
// and public-IP resolution on top
const DOMAIN_PATTERN =
  /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

export function normalizeLogoDomain(input: string): string | null {
  const domain = input
    .trim()
    .toLowerCase()
    .replace(/^www\./, "");
  if (domain.length > 253) return null;
  if (!DOMAIN_PATTERN.test(domain)) return null;
  // Real TLDs are alphabetic (or punycode) — rejects IPv4 literals
  const tld = domain.split(".").at(-1) ?? "";
  if (!/^(xn--[a-z0-9-]+|[a-z]{2,})$/.test(tld)) return null;
  return domain;
}

export async function fetchLogo({
  domain,
  logoDevToken,
  source,
  fetchImpl = createSafeImageProxyFetch,
  onAttempt,
}: {
  domain: string;
  logoDevToken?: string;
  // Restrict the chain to one provider family (the logo picker offers an
  // image per source); omitted = the full chain, first hit wins
  source?: LogoSource;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
  onAttempt?: (attempt: LogoAttempt) => void;
}): Promise<FetchedLogo | null> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  // A host that just timed out won't answer for its other candidate paths
  // either — skip them instead of burning 4s on each
  const unresponsiveHosts = new Set<string>();

  const providers = providerUrls(domain, logoDevToken).filter(
    (provider) => !source || provider.source === source,
  );

  for (const { url, minBytes } of providers) {
    // Attempts must FINISH inside the budget, or the route itself gets
    // killed by the platform's function timeout and the client sees a 5xx
    if (Date.now() + ATTEMPT_TIMEOUT_MS > deadline) {
      onAttempt?.({ url, outcome: "skipped-budget" });
      continue;
    }

    const host = new URL(url).hostname;
    if (unresponsiveHosts.has(host)) {
      onAttempt?.({ url, outcome: "skipped-unresponsive-host" });
      continue;
    }

    const attempt = await attemptFetch(url, minBytes, fetchImpl, onAttempt);
    if (attempt.logo) return attempt.logo;
    if (attempt.timedOut) unresponsiveHosts.add(host);
  }

  return null;
}

type ProviderUrl = { url: string; minBytes: number; source: LogoSource };

// Clearbit's logo API is gone (502s since the shutdown) — it's no longer in
// the chain; keeping it just burned budget ahead of the working fallbacks
function providerUrls(domain: string, logoDevToken?: string): ProviderUrl[] {
  const encoded = encodeURIComponent(domain);
  return [
    ...(logoDevToken
      ? [
          {
            url: `https://img.logo.dev/${encoded}?token=${encodeURIComponent(logoDevToken)}&size=128&format=png`,
            minBytes: MIN_AGGREGATOR_IMAGE_BYTES,
            source: "logo-dev" as const,
          },
        ]
      : []),
    {
      url: `https://icons.duckduckgo.com/ip3/${encoded}.ico`,
      minBytes: MIN_AGGREGATOR_IMAGE_BYTES,
      source: "duckduckgo" as const,
    },
    {
      url: `https://${domain}/apple-touch-icon.png`,
      minBytes: MIN_OWN_SITE_IMAGE_BYTES,
      source: "site" as const,
    },
    {
      url: `https://${domain}/apple-touch-icon-precomposed.png`,
      minBytes: MIN_OWN_SITE_IMAGE_BYTES,
      source: "site" as const,
    },
    {
      url: `https://${domain}/favicon.ico`,
      minBytes: MIN_OWN_SITE_IMAGE_BYTES,
      source: "site" as const,
    },
    {
      url: `https://www.google.com/s2/favicons?domain=${encoded}&sz=128`,
      minBytes: MIN_AGGREGATOR_IMAGE_BYTES,
      source: "google" as const,
    },
  ];
}

async function attemptFetch(
  url: string,
  minBytes: number,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
  onAttempt?: (attempt: LogoAttempt) => void,
): Promise<{ logo: FetchedLogo | null; timedOut: boolean }> {
  try {
    const response = await fetchWithRedirects(url, fetchImpl);
    if (!response?.ok) {
      onAttempt?.({ url, outcome: "bad-status", status: response?.status });
      return { logo: null, timedOut: false };
    }

    const contentType = response.headers.get("content-type") ?? "";
    // Reject SVG: it passes the image/ prefix but is an active document that
    // can carry <script>, which would run if this same-origin logo URL is
    // opened as a top-level navigation. Logos are raster in practice.
    if (!contentType.startsWith("image/") || contentType.includes("svg")) {
      onAttempt?.({
        url,
        outcome: contentType.includes("svg") ? "svg-rejected" : "not-an-image",
        status: response.status,
        contentType,
      });
      return { logo: null, timedOut: false };
    }

    const body = await readCappedBody(response);
    if (!body || body.byteLength < minBytes) {
      onAttempt?.({
        url,
        outcome: "too-small-or-capped",
        status: response.status,
        contentType,
        bytes: body?.byteLength ?? undefined,
      });
      return { logo: null, timedOut: false };
    }

    onAttempt?.({
      url,
      outcome: "hit",
      status: response.status,
      contentType,
      bytes: body.byteLength,
    });
    return { logo: { body, contentType }, timedOut: false };
  } catch (error) {
    // DNS failures and TLS errors just move down the chain; timeouts are
    // reported so the caller can skip the host's remaining candidates
    const name = error instanceof Error ? error.name : "";
    const timedOut = name === "AbortError" || name === "TimeoutError";
    onAttempt?.({ url, outcome: timedOut ? "timeout" : "error" });
    return { logo: null, timedOut };
  }
}

// The safe fetch never follows redirects itself; follow them manually so
// every hop goes back through host validation (a provider must not be able
// to 302 the request into a private address)
async function fetchWithRedirects(
  url: string,
  fetchImpl: (input: string, init?: RequestInit) => Promise<Response>,
): Promise<Response | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (new URL(current).protocol !== "https:") return null;

    const response = await fetchImpl(current, {
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      headers: { accept: "image/*" },
    });

    if (!isRedirect(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return null;
    current = new URL(location, current).toString();
  }

  return null;
}

function isRedirect(status: number) {
  return (
    status === 301 ||
    status === 302 ||
    status === 303 ||
    status === 307 ||
    status === 308
  );
}

// Reads the body with a hard byte ceiling so an oversized (or lying
// Content-Length) upstream can't exhaust memory. Reject fast on a declared
// length over the cap; otherwise stop reading once the cap is crossed.
async function readCappedBody(response: Response): Promise<ArrayBuffer | null> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) return null;

  const reader = response.body?.getReader();
  if (!reader) return null;

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_IMAGE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}
