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
  title: "Email Analytics | Inbox Zero",
  description:
    "Gain insights and enhance productivity: analyze your email patterns for better email inbox management.",
  alternates: { canonical: "/email-analytics" },
};

export default function EmailAnalytics() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Understand",
              "your",
              "inbox",
              "through",
              "email",
              "analytics",
            ]}
          />
        }
        subtitle="Gain insights and enhance productivity: analyze your email patterns for better email inbox management."
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <EmailAnalyticsFeatures />
      <Testimonials />
      <PricingLazy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function EmailAnalyticsFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Gain insights into your email habits"
        subtitle="Understand who emails you most, track your response times, and identify patterns in your inbox. Use data to make better decisions about how you manage your email and improve your productivity."
      />
      <Banner title="Data-driven email management">
        Analyze your email patterns for better inbox management. See who emails
        you most, track response times, and identify opportunities to streamline
        your workflow.
      </Banner>
      <StartedInMinutes
        title="Make informed decisions about your inbox"
        subtitle="Get actionable insights into your email habits. Understand where your time goes, identify bottlenecks, and optimize your email workflow for maximum productivity."
      />
    </div>
  );
}
