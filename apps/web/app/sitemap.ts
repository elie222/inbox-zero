import type { MetadataRoute } from "next";
import { unstable_noStore } from "next/cache";
import { getSanityBlogPostsForSitemap } from "@/utils/sitemap";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // to try fix caching issue: https://github.com/vercel/next.js/discussions/56708#discussioncomment-10127496
  unstable_noStore();

  const blogPosts = await getSanityBlogPostsForSitemap();

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
      url: "https://www.getinboxzero.com/msp",
    },
    {
      url: "https://www.getinboxzero.com/commercial-real-estate",
    },
    {
      url: "https://www.getinboxzero.com/law-firms",
    },
    {
      url: "https://www.getinboxzero.com/accounting-firms",
    },
    {
      url: "https://www.getinboxzero.com/property-management",
    },
    {
      url: "https://www.getinboxzero.com/insurance-agencies",
    },
    {
      url: "https://www.getinboxzero.com/recruiting",
    },
    {
      url: "https://www.getinboxzero.com/construction",
    },
    {
      url: "https://www.getinboxzero.com/travel-advisors",
    },
    {
      url: "https://www.getinboxzero.com/executive-assistants",
    },
    {
      url: "https://www.getinboxzero.com/operations-managers",
    },
    {
      url: "https://www.getinboxzero.com/auto-file-email-attachments",
    },
    {
      url: "https://www.getinboxzero.com/email-follow-up-tracker",
    },
    {
      url: "https://www.getinboxzero.com/client-intake-email-automation",
    },
    {
      url: "https://www.getinboxzero.com/organize-document-heavy-email",
    },
    {
      url: "https://www.getinboxzero.com/meeting-briefs-for-client-teams",
    },
    {
      url: "https://www.getinboxzero.com/ai-assistant-chat",
    },
    {
      url: "https://www.getinboxzero.com/slack-integration",
    },
    {
      url: "https://www.getinboxzero.com/telegram-integration",
    },
    {
      url: "https://www.getinboxzero.com/teams-integration",
    },
    {
      url: "https://www.getinboxzero.com/cli",
    },
    {
      url: "https://www.getinboxzero.com/openclaw",
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
