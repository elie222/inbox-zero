import { Suspense } from "react";
import { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { FeaturesColdEmailBlocker } from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = {
  title: "Cold Email Blocker | Inbox Zero",
  description: "Automatically block cold emails from your inbox using AI.",
  alternates: { canonical: "/block-cold-emails" },
};

export default function BlockColdEmails() {
  return (
    <BasicLayout>
      <Hero
        title="Automatically block cold emails using AI"
        subtitle="Auto archive or label cold emails from your inbox."
      />
      <LogoCloud />
      <Testimonials />
      <FeaturesColdEmailBlocker />
      <Suspense>
        <Pricing />
      </Suspense>
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
