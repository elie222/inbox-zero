import type { Metadata } from "next";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "Cold Email Blocker | Inbox Zero",
  description: "Automatically block cold emails from your inbox using AI.",
  alternates: { canonical: "/block-cold-emails" },
};

export default function BlockColdEmails() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={["Automatically", "block", "cold", "emails", "using", "AI"]}
          />
        }
        subtitle="Auto archive or label cold emails from your inbox."
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <Testimonials />
      <ColdEmailBlockerFeatures />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function ColdEmailBlockerFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never read a cold email again"
        subtitle="Say goodbye to unsolicited outreach. Automatically filter sales pitches and cold emails so you only see messages that matter. Block out the noise and keep your inbox clean and focused on what matters."
      />
      <Banner title="Customize what counts as a cold email">
        Tell Inbox Zero what constitutes a cold email for you. It will block
        them based on your instructions. Automatically label cold emails so you
        can review them later if needed.
      </Banner>
      <StartedInMinutes
        title="Clean inbox, zero effort"
        subtitle="Set up your cold email blocker once and it works automatically. Keep your inbox clean and focused on what matters without manually filtering through spam and sales pitches."
      />
    </div>
  );
}
