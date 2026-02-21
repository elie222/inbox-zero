import type { Metadata } from "next";
import { TermsContent } from "@/app/(landing)/terms/content";
import { getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Terms of Service"),
  description: getBrandTitle("Terms of Service"),
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <TermsContent />;
}
