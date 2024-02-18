import { Suspense } from "react";
import { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import {
  Features,
  FeaturesUnsubscribe,
  FeaturesAutomation,
  FeaturesColdEmailBlocker,
  FeaturesStats,
} from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { HeroHeadingAB, HeroSubtitleAB } from "@/app/(landing)/home/HeroAB";
import { env } from "@/env.mjs";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <BasicLayout>
      <Hero
        title={
          env.NEXT_PUBLIC_POSTHOG_HERO_AB ? (
            <Suspense>
              <HeroHeadingAB variantKey={env.NEXT_PUBLIC_POSTHOG_HERO_AB} />
            </Suspense>
          ) : undefined
        }
        subtitle={
          env.NEXT_PUBLIC_POSTHOG_HERO_AB ? (
            <Suspense>
              <HeroSubtitleAB variantKey={env.NEXT_PUBLIC_POSTHOG_HERO_AB} />
            </Suspense>
          ) : undefined
        }
      />
      <Testimonials />
      <Features />
      <FeaturesUnsubscribe />
      <FeaturesAutomation />
      <FeaturesColdEmailBlocker />
      <FeaturesStats />
      <Suspense>
        <Pricing />
      </Suspense>
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
