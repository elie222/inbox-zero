import type { Metadata } from "next";
import { PrivacyContent } from "@/app/(landing)/privacy/content";

export const metadata: Metadata = {
  title: "Privacy Policy - Inbox Zero",
  description: "Privacy Policy - Inbox Zero",
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PrivacyContent />;
}
