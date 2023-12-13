import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";
import { FeaturesStats } from "@/app/(landing)/home/Features";

export default function Home() {
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
