import { Suspense } from "react";
import type { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { FeaturesAiAssistant } from "@/app/(landing)/home/Features";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = {
  title: "AI Personal Assistant for Email | Inbox Zero",
  description:
    "Inbox Zero's AI email assistant simplifies your email management. It smartly handles repetitive queries, automates responses, and efficiently organizes your inbox, streamlining your email workflow for maximum efficiency.",
  alternates: { canonical: "/ai-automation" },
};

export default function AiAutomation() {
  return (
    <BasicLayout>
      <Hero
        title="Automate your email with AI"
        subtitle="Inbox Zero's AI email assistant simplifies your email management. It smartly handles repetitive queries, automates responses, and efficiently organizes your inbox, streamlining your email workflow for maximum efficiency."
        image="/images/home/ai-email-assistant.png"
      />
      <Testimonials />
      <FeaturesAiAssistant />
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
