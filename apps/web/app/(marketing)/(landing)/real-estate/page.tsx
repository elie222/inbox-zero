import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { BRANDS_LIST } from "@/utils/brands";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "AI Email Assistant for Real Estate Professionals | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages your email for you at a fraction of the cost of a human VA. Save hours every week and focus on closing deals while AI handles your inbox automatically.",
  alternates: { canonical: "/real-estate" },
};

export default function RealEstatePage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Close",
              "more",
              "deals",
              "while",
              "our",
              "AI",
              "handles",
              "your",
              "inbox",
            ]}
          />
        }
        subtitle="Save hours every week with an AI assistant that handles your inbox at a fraction of the cost of a human assistant. Focus on closing deals while AI manages your email automatically."
        badge="AI EMAIL ASSISTANT FOR REALTORS"
      >
        <BrandScroller brandList={BRANDS_LIST.realtor} animate={false} />
        <HeroVideoPlayer />
      </Hero>
      <RealEstateFeatures />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function RealEstateFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never miss a potential client again"
        subtitle="Every missed lead is lost revenue. Our AI monitors your inbox 24/7, instantly identifying and prioritizing potential clients so you can respond while they're still hot."
      />
      <Banner title="Keep deals moving forward">
        Inbox Zero integrates seamlessly with your existing Gmail, so there's no
        learning curve. Just open your email and watch the magic happen.
      </Banner>
      <PreWrittenDrafts
        title="Respond to leads in lightning speed"
        subtitle="Inbox Zero learns your communication style and suggests quick responses for common inquiries. Reply to pricing questions, schedule showings, and send listing details in seconds, not minutes."
      />
      <Banner title=" A productivity multiplier for your team">
        Free your agents to focus on selling, not sorting
        <br />
        The more your team uses Inbox Zero, the more time they save. Transform
        email chaos into organized efficiency across your entire brokerage.
      </Banner>
    </div>
  );
}
