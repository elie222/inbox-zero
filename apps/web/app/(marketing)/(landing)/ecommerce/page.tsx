import type { Metadata } from "next";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { Hero, HeroVideoPlayer } from "@/app/(landing)/home/Hero";
import { FinalCTA } from "@/app/(landing)/home/FinalCTA";
import { Banner } from "@/components/Banner";
import { OrganizedInbox } from "@/components/new-landing/sections/OrganizedInbox";
import { BrandScroller } from "@/components/new-landing/BrandScroller";
import { PreWrittenDrafts } from "@/components/new-landing/sections/PreWrittenDrafts";
import { WordReveal } from "@/components/new-landing/common/WordReveal";

export const metadata: Metadata = {
  title: "AI Email Assistant for Ecommerce Businesses | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages customer orders, handles shipping inquiries, and manages supplier communications automatically. Focus on growing your ecommerce business while AI handles your inbox.",
  alternates: { canonical: "/ecommerce" },
};

export default function EcommercePage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <WordReveal
            spaceBetween="w-2 md:w-3"
            words={[
              "Focus",
              "on",
              "sales",
              "while",
              "AI",
              "manages",
              "your",
              "customer",
              "communications",
            ]}
          />
        }
        subtitle="Save hours every week with an AI assistant that handles order inquiries, shipping questions, and customer support automatically. Focus on growing your ecommerce business while AI manages your customer communications."
        badge="AI EMAIL ASSISTANT FOR ECOMMERCE"
        badgeVariant="dark-blue"
      >
        <HeroVideoPlayer />
        <BrandScroller />
      </Hero>
      <EcommerceFeatures />
      <div className="pb-32">
        <PricingLazy />
      </div>
      <FAQs />
      <FinalCTA />
    </BasicLayout>
  );
}

function EcommerceFeatures() {
  return (
    <div>
      <OrganizedInbox
        title="Never miss a customer inquiry or lose a sale"
        subtitle="Our AI monitors your inbox 24/7, instantly prioritizing order inquiries, shipping questions, and customer concerns so you never miss a sale."
      />
      <Banner title="Scale your customer service with your sales">
        Inbox Zero integrates seamlessly with your existing Gmail, so there's no
        learning curve. Just open your email and focus on growing your ecommerce
        business while AI handles customer communications.
      </Banner>
      <PreWrittenDrafts
        title="Deliver exceptional service at ecommerce speed"
        subtitle="Inbox Zero learns your operations and suggests quick responses for order inquiries, product questions, and shipping concerns so you can focus on growth."
      />
      <Banner title="Scale your ecommerce without scaling your customer service headaches">
        Focus on growth, not inbox management
        <br />
        The more successful your store becomes, the more customer emails you
        receive. Transform communication chaos into organized efficiency so you
        can grow without drowning in support requests.
      </Banner>
    </div>
  );
}
