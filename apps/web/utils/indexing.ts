export const NOINDEX_ROBOTS_TAG = "noindex, nofollow";

const PRODUCTION_SITE_URL = "https://www.getinboxzero.com";
const STAGING_SITE_HOST = "staging.getinboxzero.com";
const DOCS_SITEMAP_URL = "https://docs.getinboxzero.com/sitemap.xml";

export type IndexingDecisionInput = {
  vercelEnv: string | undefined;
  baseUrl: string;
  disableIndexing: boolean;
};

type RobotsPolicy = {
  rules: {
    userAgent: string;
    allow?: string;
    disallow: string;
  };
  sitemap?: string[];
};

/**
 * Indexing stays on for www production and for self-hosted installs.
 * Staging is a separate Vercel project deployed with VERCEL_ENV=production,
 * so that variable alone cannot exclude it. A deploy is non-indexable when
 * it is a Vercel preview, its public host starts with "staging.", or
 * NEXT_PUBLIC_DISABLE_INDEXING is set.
 */
export function isIndexingAllowed(input: IndexingDecisionInput): boolean {
  if (input.disableIndexing) return false;
  if (input.vercelEnv === "preview") return false;
  if (hostStartsWithStaging(input.baseUrl)) return false;
  return true;
}

export function buildRobotsPolicy(input: IndexingDecisionInput): RobotsPolicy {
  if (!isIndexingAllowed(input)) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: "/components",
    },
    sitemap: [`${input.baseUrl}/sitemap.xml`, DOCS_SITEMAP_URL],
  };
}

/**
 * Relative canonicals resolve against metadataBase. Point the Inbox Zero
 * staging host at production. Other non-indexable hosts (previews,
 * self-hosted staging.* names, explicit opt-out) keep their own origin.
 */
export function getMetadataBaseUrl(baseUrl: string): string {
  if (hostnameOf(baseUrl) === STAGING_SITE_HOST) return PRODUCTION_SITE_URL;
  return baseUrl;
}

function hostStartsWithStaging(baseUrl: string): boolean {
  return hostnameOf(baseUrl)?.startsWith("staging.") ?? false;
}

function hostnameOf(baseUrl: string): string | undefined {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return;
  }
}
