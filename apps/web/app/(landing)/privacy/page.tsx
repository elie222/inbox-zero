import type { Metadata } from "next";
import { PrivacyContent } from "@/app/(landing)/privacy/content";
import { getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Privacy Policy"),
  description: getBrandTitle("Privacy Policy"),
  alternates: { canonical: "/privacy" },
};

export default function Page() {
  return <PrivacyContent />;
}
