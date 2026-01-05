import type { Metadata } from "next";
import { Content } from "./content";
import { StructuredData } from "@/app/(marketing)/blog/post/StructuredData";

export const metadata: Metadata = {
  title:
    "Escape the Email Trap: How to Unsubscribe for Good When Senders Won't Let Go",
  description:
    "End unwanted emails permanently. Discover tactics to block persistent senders who disregard unsubscribe requests and spam reports.",
  alternates: {
    canonical: "/blog/post/escape-email-trap-unsubscribe-for-good",
  },
};

export default function Page() {
  return (
    <>
      <StructuredData
        headline="Escape the Email Trap: How to Unsubscribe for Good When Senders Won't Let Go"
        datePublished="2024-08-22T08:00:00+00:00"
        dateModified="2024-08-22T08:00:00+00:00"
        authorName="Elie Steinbock"
        authorUrl="https://elie.tech"
        image={[]}
      />
      <Content />
    </>
  );
}
