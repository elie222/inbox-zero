import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title: "Best Email Unsubscribe App to Clean Up Your Inbox",
  description:
    "Managing your email inbox can feel like a full-time job. With promotional emails, newsletters, and updates flooding our inboxes daily, it's crucial to have effective tools to maintain order.",
  alternates: {
    canonical: "/blog/post/best-email-unsubscribe-app",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Best Email Unsubscribe App to Clean Up Your Inbox"
        datePublished="2024-06-26T08:00:00+00:00"
        dateModified="2024-06-26T08:00:00+00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
        image={[]}
      />
      <Content />
    </>
  );
}
