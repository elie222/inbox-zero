import { Suspense } from "react";
import type { Metadata } from "next";
import { Hero } from "@/app/(landing)/home/Hero";
import { FeaturesReplyZero } from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = {
  title: "Reply Zero | Track what needs a reply with AI",
  description:
    "Reply Zero uses AI to identify the emails that need a reply, and who hasn't responded yet.",
  alternates: { canonical: "/reply-zero-ai" },
};

export default function ReplyZero() {
  return (
    <BasicLayout>
      <Hero
        title="Reply Zero: Never miss a reply"
        subtitle="Most emails don't need a reply — Reply Zero surfaces the ones that do. We'll track what you need to reply to, and who to follow up with."
      />
      <FeaturesReplyZero />
      <Testimonials />
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
