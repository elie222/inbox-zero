import { Suspense } from "react";
import type { Metadata } from "next";
import { HeroHome } from "@/app/(landing)/home/Hero";
import { FeaturesHome } from "@/app/(landing)/home/Features";
import { Privacy } from "@/app/(landing)/home/Privacy";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <BasicLayout>
      <HeroHome />
      <Testimonials />
      <Privacy />
      <FeaturesHome />
      <Pricing className="pb-32" />
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
