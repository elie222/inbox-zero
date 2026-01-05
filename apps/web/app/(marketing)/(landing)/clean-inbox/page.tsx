import type { Metadata } from "next";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "Inbox Zero - Automate and clean up your inbox",
  description:
    "Clean up your inbox in minutes. Bulk unsubscribe from emails, archive old messages, and let AI manage your inbox automatically.",
  alternates: { canonical: "/clean-inbox" },
};

export default function CleanInbox() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={["Clean", "up", "your", "inbox", "in", "minutes"]}
          />
        }
        subtitle="Automate and clean up your inbox with bulk unsubscribe, smart archiving, and AI-powered email management. Take back control of your email."
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <CleanInboxFeatures />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function CleanInboxFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Take back control of your inbox"
        subtitle="Clean up your inbox in minutes. Bulk unsubscribe from emails, archive old messages, and let AI manage your inbox automatically. No more drowning in email chaos."
      />
      <Banner title="Bulk unsubscribe and smart archiving">
        Effortlessly manage the newsletters in your inbox: one click
        unsubscribe, auto archive, or approve. Archive old messages
        automatically and keep your inbox organized.
      </Banner>
      <StartedInMinutes
        title="AI-powered email management"
        subtitle="Let AI handle the heavy lifting. Your AI assistant drafts replies, organizes, and labels emails for you. Set it up once and it works 24/7 to keep your inbox clean and organized."
      />
    </div>
  );
}
