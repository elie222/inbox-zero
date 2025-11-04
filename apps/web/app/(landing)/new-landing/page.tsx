import type { Metadata } from "next";
import Image from "next/image";
import { Section } from "@/components/new-landing/common/Section";
import { BasicLayout } from "@/components/new-landing/common/BasicLayout";
import { FAQs } from "@/components/new-landing/sections/FAQs";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";
import { Hero } from "@/components/new-landing/sections/Hero";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { Awards } from "@/components/new-landing/sections/Awards";
import { BuyBackTime } from "@/components/new-landing/sections/BuyBackTime";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  return (
    <BasicLayout>
      <Hero />
      <Section
        title="An organized inbox so you never miss an important email"
        subtitle="Drowning in emails? Don't waste any more valuable brain energy trying to prioritize your emails. Our AI assistant will label everything automatically."
        wrap
      >
        <Image
          src="/images/new-landing/an-organized-inbox.svg"
          alt="an organized inbox"
          width={1000}
          height={1000}
        />
      </Section>
      <Section
        title="Pre-written drafts waiting in your inbox"
        subtitle="When you check your inbox, every email needing a response will have a pre-drafted reply in your tone, ready for you to send."
      >
        <div className="mx-20">
          <Image
            src="/images/new-landing/pre-written-drafts.svg"
            alt="pre-written drafts"
            width={1000}
            height={1000}
          />
        </div>
      </Section>
      <StartedInMinutes />
      <Section
        title="Bulk unsubscribe from emails you never read"
        subtitle="See which emails you never read, and one-click unsubscribe and archive them."
      >
        <Image
          src="/images/new-landing/bulk-unsubscribe.svg"
          alt="bulk unsubscribe"
          width={700}
          height={1000}
        />
      </Section>
      <EverythingElseSection />
      <Awards />
      <Pricing />
      <Testimonials />
      <BuyBackTime />
      <FAQs />
    </BasicLayout>
  );
}
