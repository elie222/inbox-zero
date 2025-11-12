import type { Metadata } from "next";
import { BasicLayout } from "@/components/new-landing/common/BasicLayout";
import { FAQs } from "@/components/new-landing/sections/FAQs";
import { Testimonials } from "@/components/new-landing/sections/Testimonials";
import { Hero } from "@/components/new-landing/sections/Hero";
import { Pricing } from "@/components/new-landing/sections/Pricing";
import { Awards } from "@/components/new-landing/sections/Awards";
import { BuyBackTime } from "@/components/new-landing/sections/BuyBackTime";
import { EverythingElseSection } from "@/components/new-landing/sections/EverythingElseSection";
import { StartedInMinutes } from "@/components/new-landing/sections/StartedInMinutes";
import { BulkUnsubscribe } from "@/components/new-landing/sections/BulkUnsubscribe";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";

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
      <BuyBackTime />
      <FAQs />
    </BasicLayout>
  );
}
