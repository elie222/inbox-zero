import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "How to Bulk Unsubscribe from Emails",
  description:
    "Decluttering your inbox has never been easier, or looked as organized as you want! Why? When we buy items or join an online service, the company adds us to an email subscription list, and we soon receive quite a few and all will pile up in our inbox. This article will help you fix that mess and teach you how to bulk unsubscribe from emails using Inbox Zero, a tool with the best features that can automatically unsubscribe from emails, and more. Let's make your life easier and more productive!",
  alternates: {
    canonical: "/blog/post/bulk-unsubscribe-from-emails",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="How to Bulk Unsubscribe from Emails"
        datePublished="2024-03-05T08:00:00+00:00"
        dateModified="2024-03-05T08:00:00+00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
        image={[]}
      />
      <Content />
    </>
  );
}
