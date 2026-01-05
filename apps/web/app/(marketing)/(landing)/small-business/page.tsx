import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "AI Email Assistant for Small Businesses | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages customer inquiries, vendor communications, and business opportunities automatically. Focus on growing your business while AI handles your inbox.",
  alternates: { canonical: "/small-business" },
};

export default function SmallBusinessPage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Focus",
              "on",
              "growing",
              "while",
              "AI",
              "manages",
              "your",
              "email",
            ]}
          />
        }
        subtitle="Save hours every week with an AI assistant that handles customer inquiries, vendor communications, and business opportunities automatically. Focus on running your business while AI manages your communications."
        badge="AI EMAIL ASSISTANT FOR SMALL BUSINESS"
        badgeVariant="green"
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <SmallBusinessFeatures />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function SmallBusinessFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never miss a customer or opportunity"
        subtitle="Every missed customer email is lost revenue. Our AI monitors your inbox 24/7, instantly identifying and prioritizing customer inquiries, sales opportunities, and important vendor communications so you can respond when it matters most. Automatically categorizes and prioritizes customer questions, complaints, and requests for faster response times."
      />
      <Banner title="Work smarter, not harder">
        Inbox Zero integrates seamlessly with your existing Gmail, so there's no
        learning curve. Just open your email and focus on growing your business
        while AI handles the routine communications.
      </Banner>
      <StartedInMinutes
        title="Deliver exceptional service at small business speed"
        subtitle="Inbox Zero learns your business style and suggests quick responses for customer inquiries, vendor communications, and partnership requests. Maintain professional relationships while focusing on what you do best - running your business."
      />

      <Banner title="Scale your business without scaling your workload">
        Focus on growth, not email management
        <br />
        As your business grows, so does your email volume. Transform
        communication chaos into organized efficiency so you can serve more
        customers and capture more opportunities without working longer hours.
      </Banner>
    </div>
  );
}
