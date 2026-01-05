import type { Metadata } from "next";
import Link from "next/link";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { ABTestimonial } from "@/components/PersonWithLogo";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { Button } from "@/components/new-landing/common/Button";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "AI Email Assistant for Influencers & Content Creators | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages your brand emails, collaboration requests, and fan inquiries automatically. Save hours every week and focus on creating content while AI handles your inbox.",
  alternates: { canonical: "/creator" },
};

export default function CreatorPage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Focus",
              "on",
              "creating",
              "while",
              "AI",
              "manages",
              "your",
              "email",
            ]}
          />
        }
        subtitle="Save hours every week with an AI assistant that handles brand emails, collaboration requests, and fan inquiries automatically. Focus on content creation while AI manages your business communications."
        badge="AI EMAIL ASSISTANT FOR CREATORS"
        badgeVariant="purple"
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <Banner
        title={`"We save 60+ hours weekly and grew from 20 to 50 employees. It's like having an assistant that never sleeps."`}
      >
        <div className="mt-8">
          <ABTestimonial />
        </div>
        <div className="mt-8 flex justify-center">
          <Link href="/case-studies/study/clicks-talent-saves-60-hours-weekly">
            <Button size="lg">Read their success story →</Button>
          </Link>
        </div>
      </Banner>
      <CreatorFeatures />
      <FinalCTA />
    </BasicLayout>
  );
}

function CreatorFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never miss a lucrative partnership opportunity"
        subtitle="Every missed brand email is lost revenue. Our AI monitors your inbox 24/7, instantly identifying and prioritizing collaboration opportunities so you can respond while brands are still interested."
      />
      <Banner title="Stay connected with what matters">
        Inbox Zero integrates seamlessly with your existing Gmail, so there's no
        learning curve. Just open your email and focus on creating while AI
        handles the rest.
      </Banner>
      <PreWrittenDrafts
        title="Respond to opportunities at creator speed"
        subtitle="AI learns your communication style and suggests quick responses for brand inquiries, fan questions, and collaboration requests."
      />
      <Banner title="Scale your creator business effortlessly">
        Focus on content creation, not email management
        <br />
        Transform email chaos into organized efficiency so you can scale your
        influence and income without burning out.
      </Banner>
    </div>
  );
}
