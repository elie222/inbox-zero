"use client";

import { FeaturesHome } from "@/app/(landing)/home/Features";
import { Privacy } from "@/app/(landing)/home/Privacy";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { useHomeLayoutVariant } from "@/hooks/useFeatureFlags";

export function ContentLayout() {
  const variant = useHomeLayoutVariant();

  if (variant === "new") {
    return (
      <>
        <FeaturesHome />
        <Testimonials />
        <PricingLazy className="pb-32" />
        <Privacy />
        <FAQs />
        <CTA />
      </>
    );
  }

  return (
    <>
      <Testimonials />
      <FeaturesHome />
      <Privacy />
      <PricingLazy className="pb-32" />
      <FAQs />
      <CTA />
    </>
  );
}
