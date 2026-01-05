import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "AI Email Assistant for Customer Support Teams | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages customer support tickets, prioritizes urgent issues, and drafts professional responses automatically. Deliver exceptional support while reducing team workload.",
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Deliver",
              "exceptional",
              "support",
              "while",
              "AI",
              "manages",
              "the",
              "workload",
            ]}
          />
        }
        subtitle="Transform your customer support with an AI assistant that categorizes tickets, prioritizes urgent issues, and drafts professional responses automatically. Reduce response times and improve customer satisfaction."
        badge="AI EMAIL ASSISTANT FOR SUPPORT TEAMS"
        badgeVariant="brown"
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <SupportFeatures />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function SupportFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never let a customer issue go unnoticed"
        subtitle="Our AI monitors your support inbox 24/7, instantly identifying and prioritizing urgent issues, escalations, and VIP customer requests so your team can respond when it matters most."
      />
      <Banner title="Support that scales with your business">
        Inbox Zero integrates seamlessly with your existing Gmail, so there's no
        learning curve. Just open your email and focus on solving customer
        problems while AI handles the organization.
      </Banner>
      <PreWrittenDrafts
        title="Deliver world-class support at any scale"
        subtitle="Inbox Zero learns your support processes and suggests quick responses for common issues, bug reports, and feature requests. Maintain high-quality support while handling more tickets with less effort."
      />
      <Banner title="Turn support from cost center to competitive advantage">
        Focus on solving problems, not managing emails
        <br />
        As your customer base grows, so does your support volume. Transform
        ticket chaos into organized efficiency so your team can deliver
        exceptional support without burning out.
      </Banner>
    </div>
  );
}
