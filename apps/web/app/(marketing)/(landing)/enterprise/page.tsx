import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "AI Email Assistant for Enterprise | Inbox Zero",
  description:
    "Enterprise-grade AI email management with advanced security, compliance, and team collaboration features. Streamline communication across your organization while maintaining the highest security standards.",
  alternates: { canonical: "/enterprise" },
};

export default function EnterprisePage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Give",
              "every",
              "employee",
              "an",
              "AI",
              "executive",
              "assistant",
            ]}
          />
        }
        subtitle="Stop drowning in email. Wake up to your inbox organized, replies drafted, and follow-ups handled. Open source and self-hostable for maximum enterprise control and security."
        badge="ENTERPRISE AI EMAIL ASSISTANT"
        badgeVariant="dark-blue"
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <EnterpriseFeatures />
      <FAQs />
    </BasicLayout>
  );
}

function EnterpriseFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Open source transparency meets enterprise needs"
        subtitle="Transform email from a time sink into a productivity multiplier. Every email that needs a response gets a pre-written reply ready to go, while maintaining complete control with open source transparency and self-hosting options. Deploy on your own infrastructure with complete data sovereignty. Audit our code, customize functionality, and maintain full control over your email data."
      />
      <Banner title="Transform your organization's email efficiency">
        Inbox Zero scales with your organization, providing consistent AI
        assistance across all departments while maintaining enterprise-grade
        security and the flexibility of open source. Google-verified by
        designated third-party security auditor, CASA Tier 2 accredited, with
        SOC 2 Type 2 certification. Seamless single sign-on integration with
        your organization's identity provider.
      </Banner>
      <StartedInMinutes
        title="Handoff everything but your genius"
        subtitle="Stop managing email and start managing outcomes. Delegate time-consuming conversations to AI while maintaining your organization's voice and standards. Focus on strategic work while AI handles the back-and-forth."
      />

      <Banner title="Achieve true time freedom for your organization">
        Transform how your team works with email
        <br />
        Eliminate thousands of useless back-and-forth emails. Wake up to
        meetings scheduled, follow-ups sent, and your inbox organized. Your team
        focuses on what they do best while AI handles the rest with
        enterprise-grade security and compliance.
      </Banner>
    </div>
  );
}
