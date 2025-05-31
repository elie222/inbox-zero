import { Suspense } from "react";
import type { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { FeaturesUnsubscribe } from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = {
  title: "Bulk Email Unsubscriber | Inbox Zero",
  description:
    "Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve.",
  alternates: { canonical: "/bulk-email-unsubscriber" },
};

export default function NewsletterCleaner() {
  return (
    <BasicLayout>
      <Hero
        title="Bulk unsubscribe from marketing emails and newsletters"
        subtitle="Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve."
      />
      <Testimonials />
      <FeaturesUnsubscribe />
      <Pricing className="pb-32" />
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
