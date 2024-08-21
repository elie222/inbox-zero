import { Suspense } from "react";
import type { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { FeaturesNewSenders } from "@/app/(landing)/home/Features";

export const metadata: Metadata = {
  title: "New Email Senders | Inbox Zero",
  description:
    "Manage and block new senders in your inbox. Identify and control your new email connections with a single click.",
  alternates: { canonical: "/new-email-senders" },
};

export default function NewEmailSenders() {
  return (
    <BasicLayout>
      <Hero
        title="Manage and Block New Senders in Your Inbox"
        subtitle="Identify and control your new email connections with a single click."
      />
      <Testimonials />
      <FeaturesNewSenders />
      <Suspense>
        <div className="pb-32">
          <Pricing />
        </div>
      </Suspense>
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}
