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
  title: "Reply Zero | Track what needs a reply with AI",
  description:
    "Reply Zero uses AI to identify the emails that need a reply, and who hasn't responded yet.",
  alternates: { canonical: "/reply-zero-ai" },
};

export default function ReplyZero() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={["Reply", "Zero:", "Never", "miss", "a", "reply"]}
          />
        }
        subtitle="Most emails don't need a reply — Reply Zero surfaces the ones that do. We'll track what you need to reply to, and who to follow up with."
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <ReplyZeroFeatures />
      <Testimonials />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function ReplyZeroFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Pre-written drafts waiting in your inbox"
        subtitle="Focus only on emails needing your attention. Reply Zero identifies them and prepares draft replies, letting you skip the noise and respond faster. AI-drafted replies waiting in Gmail or Outlook, ready to send or customize."
      />
      <Banner title="Never lose track of conversations">
        We label every email that needs a reply, so it's easy to focus on the
        ones that matter. Never lose track of conversations. We label emails
        awaiting replies and help you filter for overdue ones.
      </Banner>
      <StartedInMinutes
        title="One-click follow-ups"
        subtitle="Send polite nudges effortlessly. Our AI drafts follow-up messages, keeping conversations moving. Focus on what needs a reply and never miss an important conversation again."
      />
    </div>
  );
}
