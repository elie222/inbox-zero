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
  title: "AI Email Assistant for Startup Founders & Entrepreneurs | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages investor communications, partnership opportunities, and customer outreach automatically. Focus on building your startup while AI handles your inbox.",
  alternates: { canonical: "/founders" },
};

export default function FoundersPage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Focus",
              "on",
              "your",
              "startup",
              "while",
              "AI",
              "manages",
              "your",
              "email",
            ]}
          />
        }
        subtitle="Save hours every week with an AI assistant that handles investor communications, partnership opportunities, and customer outreach automatically."
        badge="AI EMAIL ASSISTANT FOR FOUNDERS"
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <FoundersFeatures />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function FoundersFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never miss a game-changing opportunity"
        subtitle="Every missed investor email could be your next funding round. Our AI monitors your inbox 24/7, instantly identifying and prioritizing funding opportunities, partnerships, and strategic connections so you can respond while opportunities are hot. Automatically identifies potential investor inquiries, funding opportunities, and partnership proposals from your inbox."
      />
      <Banner title="Stay focused on what matters most">
        Inbox Zero integrates seamlessly with your existing Gmail, so there's no
        learning curve. Just open your email and focus on building your startup
        while AI handles the communications.
      </Banner>
      <StartedInMinutes
        title="Respond at startup speed without losing quality"
        subtitle="Inbox Zero learns your leadership style and suggests quick responses for investor inquiries, customer questions, and partnership requests. Maintain professional relationships while focusing on what you do best - building your company."
      />

      <Banner title="Scale your startup without scaling your inbox stress">
        Focus on your company, not email management
        <br />
        The more your startup grows, the more communications you receive.
        Transform email chaos into organized efficiency so you can scale your
        company and raise funding without drowning in messages.
      </Banner>
    </div>
  );
}
