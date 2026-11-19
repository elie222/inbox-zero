import type { Locale } from "@/utils/i18n/locales";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { PricingComparisonTable } from "@/app/(landing)/pricing/PricingComparisonTable";
import { PricingFAQs } from "@/app/(landing)/pricing/PricingFAQs";
import { SectionContent } from "@/components/new-landing/common/Section";

export function PricingPage({ locale }: { locale: Locale }) {
  return (
    <BasicLayout locale={locale}>
      <Pricing />
      <SectionContent>
        <PricingComparisonTable />
      </SectionContent>
      <PricingFAQs />
    </BasicLayout>
  );
}
