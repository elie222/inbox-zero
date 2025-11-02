import { Section } from "./Section";
import { BasicLayout } from "./BasicLayout";
import type { Metadata } from "next";
import Image from "next/image";
import { FAQs } from "@/app/(landing)/new-landing/FAQs";
import { Testimonials } from "@/app/(landing)/new-landing/Testimonials";
import { Hero } from "@/app/(landing)/new-landing/Hero";
import { Pricing } from "@/app/(landing)/new-landing/Pricing";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  return (
    <BasicLayout>
      <Hero />
      <Section
        title="An organized inbox so you never miss an important email"
        subtitle="Drowning in emails? Don’t waste any more valuable brain energy trying to prioritize your emails. Our AI assistant will label everything automatically."
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
      <Section
        title="Get started in minutes"
        subtitle="One-click setup. Start organizing and drafting replies in minutes."
      >
        <Image
          src="/images/new-landing/get-started-in-minutes.svg"
          alt="get started in minutes"
          width={1000}
          height={1000}
        />
      </Section>
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
      <Section
        title="And everything else you need"
        subtitle="Effortless setup with one-click install. Inboxzero is intuitive and requires no technical skills."
      >
        <Image
          src="/images/new-landing/everything-else.svg"
          alt="everything else"
          width={1000}
          height={1000}
        />
      </Section>
      <Section
        title="Privacy first and open source"
        subtitle="Your data stays private — no AI training, no funny business. We’re fully certified for top-tier security, and you can even self-host Inbox Zero if you want total control."
      >
        <div />
      </Section>
      <Pricing />
      <Testimonials />
      <Section
        title="Buy back your time"
        subtitle="Stop wasting half your day on email. Start using Inbox Zero today."
      >
        <div />
      </Section>
      <FAQs />
    </BasicLayout>
  );
}
