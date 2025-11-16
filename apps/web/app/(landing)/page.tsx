import type { Metadata } from "next";
import { FAQs } from "@/components/new-landing/sections/FAQs";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";
import { Hero } from "@/components/new-landing/sections/Hero";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { Awards } from "@/components/new-landing/sections/Awards";
import { FinalCTA } from "@/components/new-landing/sections/FinalCTA";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BulkUnsubscribe } from "@/components/new-landing/sections/BulkUnsubscribe";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { BasicLayout } from "@/components/layouts/BasicLayout";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function NewLanding() {
  return (
    <BasicLayout>
      <Hero />
      <OrganizedInbox />
      <PreWrittenDrafts />
      <StartedInMinutes />
      <BulkUnsubscribe />
      <EverythingElseSection />
      <Awards />
      <Pricing />
      <Testimonials />
      <FinalCTA />
      <FAQs />
    </BasicLayout>
  );
}
