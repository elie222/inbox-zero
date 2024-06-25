import type { Metadata } from "next";
import { TermsContent } from "@/app/(landing)/terms/content";

export const metadata: Metadata = {
  title: "Terms of Service - Inbox Zero",
  description: "Terms of Service - Inbox Zero",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <TermsContent />;
}
