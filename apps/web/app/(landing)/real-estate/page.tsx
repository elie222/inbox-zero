import type { Metadata } from "next";
import {
  FlagIcon,
  ZapIcon,
  TagIcon,
  UsersIcon,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import clsx from "clsx";
import { BasicLayout } from "@/components/layouts/BasicLayout";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { Hero } from "@/app/(landing)/home/Hero";
import { CTA } from "@/app/(landing)/home/CTA";
import { MuxVideo } from "@/components/MuxVideo";
import { FeaturesWithImage } from "@/app/(landing)/home/Features";

export const metadata: Metadata = {
  title: "AI Email Assistant for Real Estate Professionals | Inbox Zero",
  description:
    "Get an AI virtual assistant that manages your email for you at a fraction of the cost of a human VA. Save hours every week and focus on closing deals while AI handles your inbox automatically.",
  alternates: { canonical: "/real-estate" },
};

export default function RealEstatePage() {
  return (
    <BasicLayout>
      <Hero
        title={
          <>
            <div className="mb-8">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                AI EMAIL ASSISTANT FOR REALTORS
              </span>
            </div>
            Close more deals while our AI handles your inbox
          </>
        }
        subtitle="Save hours every week with an AI assistant that handles your inbox at a fraction of the cost of a human assistant. Focus on closing deals while AI manages your email automatically."
        image="/images/home/ai-email-assistant.png"
        hideProductHuntBadge
        video={
          <MuxVideo
            playbackId="d7CiIIV9m7dYyrO02NlY1G9XzoCQve9jntoyi1G1g01dA"
            title="Inbox Zero AI for Realtors"
            className="relative -m-2 rounded-xl bg-gray-900/5 p-2 ring-1 ring-inset ring-gray-900/10 lg:-m-4 lg:rounded-2xl lg:p-4"
            thumbnailTime={30}
          />
        }
      />

      {/* <Testimonials /> */}
      <RealEstateFeatures />
      <Pricing className="pb-32" />
      <FAQs />
      <CTA />
    </BasicLayout>
  );
}

const leadCaptureFeatures = [
  {
    name: "Lead detection",
    description:
      "Automatically identifies potential new clients from inquiries, referrals, and cold outreach.",
    icon: FlagIcon,
  },
  {
    name: "Auto labeling",
    description:
      "Automatically labels lead emails so they stand out in your inbox.",
    icon: TagIcon,
  },
  {
    name: "Pre-drafted responses",
    description:
      "AI writes personalized response drafts for leads, ready for you to review and send.",
    icon: ZapIcon,
  },
];

const responseFeatures = [
  {
    name: "Lightning-fast responses",
    description:
      "Reply to pricing questions, schedule showings, and send listing details in seconds.",
    icon: ZapIcon,
  },
  {
    name: "Smart suggestions",
    description:
      "AI learns your communication style and suggests quick responses for common inquiries.",
    icon: UsersIcon,
  },
];

export function RealEstateFeatures() {
  return (
    <div className="bg-gray-50">
      <FeaturesWithImage
        imageSide="left"
        title="Lead Capture"
        subtitle="Never miss a potential client again"
        description="Every missed lead is lost revenue. Our AI monitors your inbox 24/7, instantly identifying and prioritizing potential clients so you can respond while they're still hot."
        image="/images/home/realtor-gmail.png"
        features={leadCaptureFeatures}
      />

      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-cal text-3xl text-gray-900 sm:text-4xl">
            Keep deals moving forward
          </h2>
          <p className="mt-6 text-lg leading-8 text-gray-600">
            Inbox Zero integrates seamlessly with your existing Gmail, so
            there's no learning curve. Just open your email and watch the magic
            happen.
          </p>
        </div>
      </div>

      <FeaturesWithImage
        imageSide="right"
        title="Instant Responses"
        subtitle="Respond to leads in lightning speed"
        description="Inbox Zero learns your communication style and suggests quick responses for common inquiries. Reply to pricing questions, schedule showings, and send listing details in seconds, not minutes."
        image="/images/home/reply-zero.png"
        features={responseFeatures}
      />

      <div className="bg-blue-600">
        <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-cal text-3xl text-white sm:text-4xl">
              A productivity multiplier for your team
            </h2>
            <p className="mt-6 text-lg leading-8 text-blue-100">
              Free your agents to focus on selling, not sorting
            </p>
            <p className="mt-4 text-lg leading-8 text-blue-100">
              The more your team uses Inbox Zero, the more time they save.
              Transform email chaos into organized efficiency across your entire
              brokerage.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
