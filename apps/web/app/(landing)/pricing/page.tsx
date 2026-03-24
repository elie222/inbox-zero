import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { PricingComparisonTable } from "@/app/(landing)/pricing/PricingComparisonTable";
import { PricingFAQs } from "@/app/(landing)/pricing/PricingFAQs";
import {
  Section,
  SectionContent,
} from "@/components/new-landing/common/Section";
import { PageHeading } from "@/components/new-landing/common/Typography";
import { getBrandTitle } from "@/utils/branding";

export const metadata: Metadata = {
  title: getBrandTitle("Pricing"),
  description: "Simple, transparent pricing. No hidden fees. Cancel anytime.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <BasicLayout>
      <Section>
        <PageHeading>Pricing</PageHeading>
      </Section>
      <Pricing />
      <SectionContent>
        <PricingComparisonTable />
      </SectionContent>
      <PricingFAQs />
    </BasicLayout>
  );
}
