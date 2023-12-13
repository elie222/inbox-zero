import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";
import { FeaturesAutomation } from "@/app/(landing)/home/Features";

export default function AiAutomation() {
  return (
    <div className="bg-white">
      <Header />

      <main className="isolate">
        <Hero
          title="Automate your email inbox with AI automation"
          subtitle="Inbox Zero's AI automation simplifies your email management. It smartly handles repetitive queries, automates responses, and efficiently organizes your inbox, streamlining your email workflow for maximum efficiency."
          image="/images/rules.png"
        />
        {/* <LogoCloud /> */}
        <Testimonials />
        <FeaturesAutomation />
        <Pricing />
        <FAQs />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
