import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Achieve Mental Clarity with Inbox Zero",
  description:
    "Learn how to achieve and maintain Inbox Zero for better mental health. Reduce stress, boost productivity, and gain mental clarity with these strategies.",
  alternates: {
    canonical: "/blog/post/inbox-zero-benefits-for-mental-health",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Inbox Zero Benefitsfor Mental Health"
        datePublished="2024-06-27T23:00:00+00:00"
        dateModified="2024-06-27T23:00:00+00:00"
        authorName="Ricardo Batista"
        authorUrl="https://getaiblogarticles.com/"
        image={[]}
      />
      <Content />
    </>
  );
}
