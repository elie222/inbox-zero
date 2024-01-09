import { Metadata } from "next";
import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";
import { FeaturesStats } from "@/app/(landing)/home/Features";

export const metadata: Metadata = {
  title: "Email Analytics | Inbox Zero",
  description:
    "Gain insights and enhance productivity: analyze your email patterns for better email inbox management.",
  alternates: { canonical: "/email-analytics" },
};

export default function EmailAnalytics() {
  return (
    <div className="bg-white">
      <Header />

      <main className="isolate">
        <Hero
          title="Understand your inbox through email analytics"
          subtitle="Gain insights and enhance productivity: analyze your email patterns for better email inbox management."
          image="/images/stats.png"
        />
        {/* <LogoCloud /> */}
        <Testimonials />
        <FeaturesStats />
        <Pricing />
        <FAQs />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
