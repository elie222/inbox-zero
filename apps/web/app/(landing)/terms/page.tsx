import { Metadata } from "next";
import { TermsContent } from "@/app/(landing)/terms/content";

export const metadata: Metadata = {
  title: "Terms of Service - Syncade",
  description: "Terms of Service - Syncade",
  alternates: { canonical: "/terms" },
};

export default function Page() {
  return <TermsContent />;
}
