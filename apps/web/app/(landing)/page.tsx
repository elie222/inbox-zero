// import '@/app/(landing)/home/home.css'
import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { Features, Features2 } from "@/app/(landing)/home/Features";
// import { Testimonials } from "@/app/(landing)/home/Testimonials";
// import { Pricing } from "@/app/(landing)/home/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";

export default function Home() {
  return (
    <div className="bg-white">
      <Header />

      <main className="isolate">
        <Hero />
        {/* <LogoCloud /> */}
        <Features />
        <Features2 />
        {/* <Testimonials /> */}
        {/* <Pricing /> */}
        <div className="mt-32">
          <FAQs />
        </div>
        <CTA />
      </main>

      <Footer />
    </div>
  );
}
