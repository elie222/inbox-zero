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
  title: "Bulk Email Unsubscriber | Inbox Zero",
  description:
    "Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve.",
  alternates: { canonical: "/bulk-email-unsubscriber" },
};

export default function NewsletterCleaner() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Bulk",
              "unsubscribe",
              "from",
              "marketing",
              "emails",
              "and",
              "newsletters",
            ]}
          />
        }
        subtitle="Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve."
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <UnsubscribeFeatures />
      <Testimonials />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function UnsubscribeFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Take back control of your inbox"
        subtitle="Effortlessly manage the newsletters in your inbox. One click unsubscribe, auto archive, or approve. No more drowning in marketing emails and newsletters you never signed up for."
      />
      <Banner title="Bulk unsubscribe in seconds">
        Review and unsubscribe from hundreds of newsletters at once. Inbox Zero
        identifies all your subscriptions and lets you clean them up with a
        single click.
      </Banner>
      <StartedInMinutes
        title="Clean inbox, minimal effort"
        subtitle="Set up automatic archiving for newsletters you want to keep but don't need cluttering your inbox. Or approve the ones you actually want to read. Your inbox, your rules."
      />
    </div>
  );
}
