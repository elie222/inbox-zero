import "server-only";

import { createScopedLogger } from "@/utils/logger";

const DEFAULT_SANITY_API_VERSION = "2024-09-03";
const DEFAULT_SANITY_DATASET = "production";
const DUMMY_SANITY_PROJECT_ID = "project123";
const POST_SLUGS_QUERY = `*[_type == "post"] {
  "slug": slug.current,
  date
}`;

const logger = createScopedLogger("sitemap");

type SanitySitemapResponse = {
  result?: Array<{
    slug?: string | null;
    date?: string | null;
  }>;
};

export async function getSanityBlogPostsForSitemap(
  fetchImpl: typeof fetch = fetch,
) {
  const projectId = getEnvValue(process.env.NEXT_PUBLIC_SANITY_PROJECT_ID);
  if (!projectId || projectId === DUMMY_SANITY_PROJECT_ID) {
    return [];
  }

  const dataset =
    getEnvValue(process.env.NEXT_PUBLIC_SANITY_DATASET) ||
    DEFAULT_SANITY_DATASET;
  const apiVersion =
    getEnvValue(process.env.NEXT_PUBLIC_SANITY_API_VERSION) ||
    DEFAULT_SANITY_API_VERSION;

  const url = new URL(
    `https://${projectId}.apicdn.sanity.io/v${apiVersion}/data/query/${dataset}`,
  );
  url.searchParams.set("query", POST_SLUGS_QUERY);

  try {
    const response = await fetchImpl(url.toString(), {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      logger.warn("Failed to fetch blog posts for sitemap", {
        projectId,
        dataset,
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }

    const data = (await response.json()) as SanitySitemapResponse;

    return (data.result || []).flatMap((post) => {
      if (!post.slug || !post.date) return [];

      return [
        {
          url: `https://www.getinboxzero.com/blog/post/${post.slug}`,
          lastModified: new Date(post.date),
        },
      ];
    });
  } catch (error) {
    logger.warn("Failed to fetch blog posts for sitemap", {
      projectId,
      dataset,
      error,
    });
    return [];
  }
}

function getEnvValue(value: string | undefined) {
  if (!value || value === "undefined") return undefined;
  return value;
}
