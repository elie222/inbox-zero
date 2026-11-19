import type { Metadata } from "next";
import { getPricingMetadata } from "@/app/(landing)/pricing/pricing-metadata";
import { PricingPage } from "@/app/(landing)/pricing/PricingPage";

export const metadata: Metadata = getPricingMetadata("en");

export default function Page() {
  return <PricingPage locale="en" />;
}
