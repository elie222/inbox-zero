import type { MetadataRoute } from "next";
import { unstable_noStore } from "next/cache";
import { createScopedLogger } from "@/utils/logger";

const { sanityFetch } = await import("./sanity/lib/fetch");
const { postSlugsQuery } = await import("./sanity/lib/queries");

const logger = createScopedLogger("sitemap");

async function getBlogPosts() {
  // Skip Sanity fetch during build with dummy credentials or if marketing submodule is not available
  if (
    !process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === "project123"
  ) {
    return []; // Return empty array directly
  }

  try {
    const posts = await sanityFetch<{ slug: string; date: string }[]>({
      query: postSlugsQuery,
    });
    return posts.map((post) => ({
      url: `https://www.getinboxzero.com/blog/post/${post.slug}`,
      lastModified: new Date(post.date),
    }));
  } catch (error) {
    // If marketing submodule is not available, return empty array
    logger.warn(
      "Marketing submodule not available, skipping blog posts in sitemap:",
      { error },
    );
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // to try fix caching issue: https://github.com/vercel/next.js/discussions/56708#discussioncomment-10127496
  unstable_noStore();

  const blogPosts = await getBlogPosts();

  const staticUrls = [
    {
      url: "https://www.getinboxzero.com/",
      priority: 1,
    },
    {
      url: "https://www.getinboxzero.com/bulk-email-unsubscriber",
    },
    {
      url: "https://www.getinboxzero.com/ai-automation",
    },
    {
      url: "https://www.getinboxzero.com/email-analytics",
    },
    {
      url: "https://www.getinboxzero.com/block-cold-emails",
    },
    {
      url: "https://www.getinboxzero.com/clean-inbox",
    },
    {
      url: "https://www.getinboxzero.com/enterprise",
    },
    {
      url: "https://www.getinboxzero.com/founders",
    },
    {
      url: "https://www.getinboxzero.com/small-business",
    },
    {
      url: "https://www.getinboxzero.com/creator",
    },
    {
      url: "https://www.getinboxzero.com/real-estate",
    },
    {
      url: "https://www.getinboxzero.com/support",
    },
    {
      url: "https://www.getinboxzero.com/ecommerce",
    },
    {
      url: "https://www.getinboxzero.com/privacy",
    },
    {
      url: "https://www.getinboxzero.com/terms",
    },
    {
      url: "https://www.getinboxzero.com/blog",
      changeFrequency: "daily",
      lastModified: new Date(),
      priority: 1,
    },
    {
      url: "https://www.getinboxzero.com/best-fyxer-alternative",
    },
    {
      url: "https://www.getinboxzero.com/best-perplexity-email-assistant-alternative",
    },
    {
      url: "https://www.getinboxzero.com/blog/post/how-my-open-source-saas-hit-first-on-product-hunt",
    },
    {
      url: "https://www.getinboxzero.com/blog/post/why-build-an-open-source-saas",
    },
    {
      url: "https://www.getinboxzero.com/blog/post/alternatives-to-skiff-mail",
    },
    {
      url: "https://www.getinboxzero.com/blog/post/best-email-unsubscribe-app",
    },
    {
      url: "https://www.getinboxzero.com/blog/post/bulk-unsubscribe-from-emails",
    },
    {
      url: "https://www.getinboxzero.com/blog/post/escape-email-trap-unsubscribe-for-good",
    },
    {
      url: "https://docs.getinboxzero.com/",
    },
  ];

  return [...staticUrls, ...blogPosts];
}
