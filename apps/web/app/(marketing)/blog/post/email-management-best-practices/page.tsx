import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Master Email Management with These Top Tips and Tools",
  description:
    "Learn the best email management practices to boost productivity and efficiency. Discover tools and techniques for effective inbox organization.",
  alternates: {
    canonical: "/blog/post/email-management-best-practices",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Email Management Best Practices"
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
