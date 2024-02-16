import { Suspense } from "react";
import { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { FeaturesStats } from "@/app/(landing)/home/Features";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = {
  title: "Email Analytics | Inbox Zero",
  description:
    "Gain insights and enhance productivity: analyze your email patterns for better email inbox management.",
  alternates: { canonical: "/email-analytics" },
};

export default function EmailAnalytics() {
  return (
    <BasicLayout>
      <Hero
        title="Understand your inbox through email analytics"
        subtitle="Gain insights and enhance productivity: analyze your email patterns for better email inbox management."
        image="/images/analytics.png"
      />
      <Testimonials />
      <FeaturesStats />
      <Suspense>
        <Pricing />
      </Suspense>
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
