import { Suspense } from "react";
import { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { FeaturesUnsubscribe } from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = {
  title: "Email Newsletter Cleaner | Inbox Zero",
  description:
    "Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve.",
  alternates: { canonical: "/newsletter-cleaner" },
};

export default function NewsletterCleaner() {
  return (
    <BasicLayout>
      <Hero
        title="Clean up your newsletter subscriptions"
        subtitle="Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve."
      />
      <LogoCloud />
      <Testimonials />
      <FeaturesUnsubscribe />
      <Suspense>
        <Pricing />
      </Suspense>
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
