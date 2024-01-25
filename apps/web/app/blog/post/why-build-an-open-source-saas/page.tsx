import { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Why Build An Open Source SaaS",
  description:
    "Open source SaaS products are blowing up. This is why you should consider building one.",
  alternates: {
    canonical: "/blog/why-build-an-open-source-saas",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Why Build An Open Source SaaS"
        datePublished="2024-01-25T08:00:00"
        dateModified="2024-01-25T08:00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
      />
      <Content />
    </>
  );
}
