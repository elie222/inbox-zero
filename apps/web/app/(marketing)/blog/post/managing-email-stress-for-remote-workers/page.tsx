import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "How to Beat Email Stress as a Remote Worker",
  description:
    "Learn effective strategies and tools to manage email stress for remote workers. Increase productivity and work-life balance with expert recommendations.",
  alternates: {
    canonical: "/blog/post/managing-email-stress-for-remote-workers",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Managing Email Stress for Remote Workers"
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
