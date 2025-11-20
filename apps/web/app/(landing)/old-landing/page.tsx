import type { Metadata } from "next";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { FeaturesHome } from "@/app/(landing)/home/Features";
import { Privacy } from "@/app/(landing)/home/Privacy";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";

export const metadata: Metadata = { alternates: { canonical: "/old-landing" } };

export default function Home() {
  return (
    <BasicLayout>
      <HeroHome />
      <FeaturesHome />
      <Testimonials />
      <div className="pb-32">
        <PricingLazy />
      </div>
      <Privacy />
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function HeroHome() {
  return (
    <Hero
      title="Meet Your AI Email Assistant That Actually Works"
      subtitle="Inbox Zero organizes your inbox, drafts replies in your voice, and helps you reach inbox zero fast. Never miss an important email again."
    >
      <HeroVideoPlayer />
    </Hero>
  );
}
