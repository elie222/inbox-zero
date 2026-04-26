import type { Metadata } from "next";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";
import { Hero, HeroContent } from "@/app/(landing)/home/Hero";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { Awards } from "@/components/new-landing/sections/Awards";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BulkUnsubscribe } from "@/components/new-landing/sections/BulkUnsubscribe";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { ManageFromAnywhere } from "@/components/new-landing/sections/ManageFromAnywhere";
import { AutoFileAttachments } from "@/components/new-landing/sections/AutoFileAttachments";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { WordReveal } from "@/components/new-landing/common/WordReveal";
import { env } from "@/env";
import { BRAND_NAME } from "@/utils/branding";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  if (env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS) {
    return (
      <BasicLayout>
        <Hero
          title={`${BRAND_NAME} for self-hosted teams`}
          subtitle={`Deploy ${BRAND_NAME} on your own infrastructure and automate your inbox with full data control.`}
        />
      </BasicLayout>
    );
  }

  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Meet",
              "your",
              "AI",
              "email",
              "assistant",
              "that",
              <em key="actually">actually</em>,
              "works",
            ]}
          />
        }
        subtitle={`${BRAND_NAME} organizes your inbox and calendar, drafts replies in your voice, and helps you reach inbox zero fast. Never miss an important email again.`}
      >
        <HeroContent />
      </Hero>
      <OrganizedInbox
        title={
          <>
            Automatically organized.
            <br />
            Never miss an important email again.
          </>
        }
        subtitle="Drowning in emails? Don't waste energy trying to prioritize your emails. Our AI assistant will label everything automatically."
      />
      <PreWrittenDrafts
        title="Pre-written drafts waiting in your inbox"
        subtitle="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
      />
      <ManageFromAnywhere />
      <StartedInMinutes
        title="Get started in minutes"
        subtitle="One-click setup. Start organizing and drafting replies in minutes."
      />
      <BulkUnsubscribe />
      <AutoFileAttachments />
      <EverythingElseSection />
      <Awards />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <FAQs />
    </BasicLayout>
  );
}
