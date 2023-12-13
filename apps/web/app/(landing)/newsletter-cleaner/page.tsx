import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { FeaturesUnsubscribe } from "@/app/(landing)/home/Features";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";

export default function NewsletterCleaner() {
  return (
    <div className="bg-white">
      <Header />

      <main className="isolate">
        <Hero
          title="Clean up your newsletter subscriptions"
          subtitle="Effortlessly manage the newsletters in your inbox: one click unsubscribe, auto archive, or approve."
        />
        {/* <LogoCloud /> */}
        <Testimonials />
        <FeaturesUnsubscribe />
        <Pricing />
        <FAQs />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
