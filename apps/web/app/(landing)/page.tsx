import { Suspense } from "react";
import { Metadata } from "next";
import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import {
  Features,
  FeaturesAutomation,
  FeaturesStats,
  FeaturesUnsubscribe,
} from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function Home() {
  return (
    <div className="bg-white">
      <Header />

      <main className="isolate">
        <Hero />
        {/* <LogoCloud /> */}
        <Testimonials />
        <Features />
        <FeaturesUnsubscribe />
        <FeaturesStats />
        <FeaturesAutomation />
        <Suspense>
          <Pricing />
        </Suspense>
        <FAQs />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
