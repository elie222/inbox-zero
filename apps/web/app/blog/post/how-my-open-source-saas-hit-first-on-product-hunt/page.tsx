import { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "How Inbox Zero hit #1 on Product Hunt",
  description:
    "Inbox Zero finished first place on Product Hunt. This is how we did it.",
  alternates: {
    canonical: "/blog/how-my-open-source-saas-hit-first-on-product-hunt",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="How Inbox Zero hit #1 on Product Hunt"
        datePublished="2024-01-22T08:00:00"
        dateModified="2024-01-22T08:00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
      />
      <Content />
    </>
  );
}
