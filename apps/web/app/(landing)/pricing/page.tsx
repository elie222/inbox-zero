import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { PricingComparisonTable } from "@/app/(landing)/pricing/PricingComparisonTable";
import { PricingFAQs } from "@/app/(landing)/pricing/PricingFAQs";
import { SectionContent } from "@/components/new-landing/common/Section";

export const metadata: Metadata = {
  title: "Pricing - Inbox Zero",
  description: "Simple, transparent pricing. No hidden fees. Cancel anytime.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <BasicLayout>
      <Pricing />
      <SectionContent>
        <PricingComparisonTable />
      </SectionContent>
      <PricingFAQs />
    </BasicLayout>
  );
}
