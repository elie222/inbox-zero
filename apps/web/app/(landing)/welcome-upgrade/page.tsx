"use client";

import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";
import { ABTestimonial } from "@/components/PersonWithLogo";
import { useWelcomeTestimonialVariant } from "@/hooks/useFeatureFlags";

export default function WelcomeUpgradePage() {
  const testimonialVariant = useWelcomeTestimonialVariant();

  return (
    <>
      <WelcomeUpgradeNav />
      <PricingLazy showSkipUpgrade header={<WelcomeUpgradeHeader />} />
      {testimonialVariant === "control" && (
        <div className="mt-20">
          <Testimonial />
        </div>
      )}
      <Footer />
    </>
  );
}

function Testimonial() {
  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50">
      <div className="mx-auto max-w-7xl px-6 py-20 sm:py-24 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          <blockquote className="text-xl font-semibold text-gray-900 sm:text-2xl lg:text-3xl leading-relaxed">
            "We save 60+ hours weekly and let us grow from 20 to 50 employees.
            It's like having an assistant that never sleeps."
          </blockquote>
          <div className="mt-8">
            <ABTestimonial />
          </div>
        </div>
      </div>
    </div>
  );
}
