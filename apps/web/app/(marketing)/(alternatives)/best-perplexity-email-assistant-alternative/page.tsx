import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title:
    "Best Perplexity Email Assistant Alternative in 2025: Inbox Zero Comparison",
  description:
    "Looking for a better Perplexity Email Assistant alternative? Compare Perplexity vs Inbox Zero for email management. Get more customization, bulk unsubscribe, and better pricing with Inbox Zero.",
  keywords: [
    "Perplexity alternative",
    "Perplexity Email Assistant alternative",
    "Perplexity vs Inbox Zero",
    "best email management tool",
    "AI email assistant",
    "email productivity app",
    "Perplexity email review",
    "email automation tool",
    "bulk unsubscribe",
  ],
  alternates: {
    canonical:
      "https://www.getinboxzero.com/best-perplexity-email-assistant-alternative",
  },
  openGraph: {
    title:
      "Best Perplexity Email Assistant Alternative in 2025: Inbox Zero Comparison",
    description:
      "Looking for a better Perplexity Email Assistant alternative? Compare Perplexity vs Inbox Zero. Get full customization, bulk unsubscribe, and transparent pricing starting at $20/month.",
    type: "article",
    siteName: "Inbox Zero",
    images: [
      {
        url: "https://images.getinboxzero.com/inbox-zero-vs-perplexity.png",
        width: 1200,
        height: 630,
        alt: "Perplexity Email Assistant vs Inbox Zero comparison",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Perplexity Email Assistant Alternative in 2025: Inbox Zero",
    description:
      "Compare Perplexity Email Assistant vs Inbox Zero: ✓ Full customization ✓ Bulk unsubscribe ✓ Open source ✓ Better pricing. Find the best AI email assistant.",
    images: ["https://images.getinboxzero.com/inbox-zero-vs-perplexity.png"],
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Best Perplexity Email Assistant Alternative in 2025: Inbox Zero Comparison"
        datePublished="2025-09-25T08:00:00+00:00"
        dateModified="2025-09-25T10:00:00+00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
        image={["https://images.getinboxzero.com/inbox-zero-vs-perplexity.png"]}
      />
      <Content />
    </>
  );
}
