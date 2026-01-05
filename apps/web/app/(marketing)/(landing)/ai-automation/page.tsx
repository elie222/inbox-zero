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
  title: "AI Personal Assistant for Email | Inbox Zero",
  description:
    "Inbox Zero's AI email assistant simplifies your email management. It smartly handles repetitive queries, automates responses, and efficiently organizes your inbox, streamlining your email workflow for maximum efficiency.",
  alternates: { canonical: "/ai-automation" },
};

export default function AiAutomation() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={["Automate", "your", "email", "with", "AI"]}
          />
        }
        subtitle="Inbox Zero's AI email assistant simplifies your email management. It smartly handles repetitive queries, automates responses, and efficiently organizes your inbox, streamlining your email workflow for maximum efficiency."
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <AiAutomationFeatures />
      <Testimonials />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function AiAutomationFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Your AI Email Assistant That Works Like Magic"
        subtitle="A personal assistant at a fraction of the cost. Drafts replies, organizes, and labels emails. Tell it what you want in plain English and it works 24/7."
      />
      <Banner title="Seamless integration with your existing email">
        Inbox Zero integrates seamlessly with your existing Gmail or Outlook, so
        there's no learning curve. Just open your email and watch the magic
        happen.
      </Banner>
      <StartedInMinutes
        title="Configure in minutes, automate forever"
        subtitle="Set up your AI assistant once and it works 24/7. No more manual email management. No more drowning in your inbox. Just tell it what you want in plain English and let it handle the rest."
      />
    </div>
  );
}
