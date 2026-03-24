import type { Metadata } from "next";
import { TermsContent } from "@/app/(landing)/terms/content";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Terms of Service"),
  description: `Review ${BRAND_NAME}'s terms of service. Understand your rights and obligations when using our platform.`,
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <TermsContent />;
}
