import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Best Fyxer.ai Alternative in 2025: Inbox Zero Comparison",
  description:
    "Looking for a better Fyxer alternative? Compare Fyxer.ai vs Inbox Zero for email management. Is Fyxer worth the high price? Find the best AI email assistant that actually saves you time and money.",
  keywords: [
    "Fyxer alternative",
    "Fyxer.ai alternative",
    "Fyxer vs Inbox Zero",
    "best email management tool",
    "AI email assistant",
    "email productivity app",
    "Fyxer.ai review",
    "is Fyxer safe",
    "Fyxer pricing",
  ],
  alternates: {
    canonical: "https://www.getinboxzero.com/best-fyxer-alternative",
  },
  openGraph: {
    title: "Best Fyxer.ai Alternative in 2025: Inbox Zero Comparison",
    description:
      "Looking for a better Fyxer alternative? Compare Fyxer.ai vs Inbox Zero. Save $10-30/month with more features, open-source transparency, and true email automation.",
    type: "article",
    siteName: "Inbox Zero",
    images: [
      {
        url: "https://images.getinboxzero.com/inbox-zero-vs-fyxer.png",
        width: 1200,
        height: 630,
        alt: "Fyxer.ai vs Inbox Zero comparison",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Best Fyxer.ai Alternative in 2025: Inbox Zero",
    description:
      "Compare Fyxer.ai vs Inbox Zero: ✓ Save $10-30/month ✓ More features ✓ Open source ✓ True bulk unsubscribe. Find the best AI email assistant.",
    images: ["https://images.getinboxzero.com/inbox-zero-vs-fyxer.png"],
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Best Fyxer.ai Alternative in 2025: Inbox Zero Comparison"
        datePublished="2025-09-15T08:00:00+00:00"
        dateModified="2025-09-15T10:00:00+00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
        image={["https://images.getinboxzero.com/inbox-zero-vs-fyxer.png"]}
      />
      <Content />
    </>
  );
}
