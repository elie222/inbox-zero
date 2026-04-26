import type { Metadata } from "next";
import { PrivacyContent } from "@/app/(landing)/privacy/content";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Privacy Policy"),
  description: `Read ${BRAND_NAME}'s privacy policy. Learn how we collect, use, and protect your data.`,
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PrivacyContent />;
}
