import type { MetadataRoute } from "next";
import { unstable_noStore } from "next/cache";

async function getBlogPosts() {
  // Skip Sanity fetch during build with dummy credentials or if marketing submodule is not available
  if (
    !process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ||
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID === "project123"
  ) {
    return []; // Return empty array directly
  }

  try {
    // Dynamic imports to handle cases where marketing submodule is not available
    // @ts-ignore - Marketing submodule may not be available during build
    const { sanityFetch } = await import("@/app/(marketing)/sanity/lib/fetch");
    // @ts-ignore - Marketing submodule may not be available during build
    const { postSlugsQuery } = await import(
      "@/app/(marketing)/sanity/lib/queries"
    );

    const posts = await sanityFetch<{ slug: string; date: string }[]>({
      query: postSlugsQuery,
    });
    return posts.map((post) => ({
      url: `https://www.getinboxzero.com/blog/post/${post.slug}`,
      lastModified: new Date(post.date),
    }));
  } catch (error) {
    // If marketing submodule is not available, return empty array
    console.warn(
      "Marketing submodule not available, skipping blog posts in sitemap:",
      error,
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
    {
      url: "https://docs.getinboxzero.com/introduction",
    },
    {
      url: "https://docs.getinboxzero.com/essentials/email-ai-automation",
    },
    {
      url: "https://docs.getinboxzero.com/essentials/bulk-email-unsubscriber",
    },
    {
      url: "https://docs.getinboxzero.com/essentials/cold-email-blocker",
    },
  ];

  return [...staticUrls, ...blogPosts];
}
