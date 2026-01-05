import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Boost Your Email Efficiency with These Gmail Productivity Hacks",
  description:
    "Discover effective Gmail productivity hacks to streamline your email management. Learn key tips, tools, and techniques for maximizing efficiency.",
  alternates: {
    canonical: "/blog/post/gmail-productivity-hacks",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Gmail Productivity Hacks"
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
