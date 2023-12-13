import {
  BlocksIcon,
  EyeIcon,
  ListStartIcon,
  ShieldHalfIcon,
} from "lucide-react";
import { Header } from "@/app/(landing)/home/Header";
import { Hero } from "@/app/(landing)/home/Hero";
// import { LogoCloud } from "@/app/(landing)/home/LogoCloud";
import { Testimonials } from "@/app/(landing)/home/Testimonials";
import { Pricing } from "@/app/(app)/premium/Pricing";
import { FAQs } from "@/app/(landing)/home/FAQs";
import { CTA } from "@/app/(landing)/home/CTA";
import { Footer } from "@/app/(landing)/home/Footer";
import { FeaturesWithImage } from "@/app/(landing)/home/Features";

export default function NewEmailSenders() {
  return (
    <div className="bg-white">
      <Header />

      <main className="isolate">
        <Hero
          title="Manage and Block New Senders in Your Inbox"
          subtitle="Identify and control your new email connections with a single click."
        />
        {/* <LogoCloud /> */}
        <Testimonials />
        <FeaturesNewSenders />
        <Pricing />
        <FAQs />
        <CTA />
      </main>

      <Footer />
    </div>
  );
}

const featuresNewSenders = [
  {
    name: "Quickly Identify New Senders",
    description:
      "Conveniently lists all new individuals or entities that recently emailed you, helping you spot important contacts.",
    icon: EyeIcon,
  },
  {
    name: "Effortless Blocking",
    description:
      "Easily block any unwanted sender with a single click, keeping your inbox clean and relevant.",
    icon: ShieldHalfIcon,
  },
  {
    name: "Stay Organized and Secure",
    description:
      "Enhance your email security by managing unfamiliar senders, reducing the risk of spam and phishing attacks.",
    icon: BlocksIcon,
  },
  {
    name: "Personalize Your Email Experience",
    description:
      "Discover and prioritize important emails, ensuring you never miss out on significant introductions or opportunities.",
    icon: ListStartIcon,
  },
];

function FeaturesNewSenders() {
  return (
    <FeaturesWithImage
      imageSide="left"
      title="Newsletter Management"
      subtitle="Manage new senders in your inbox"
      description="View a comprehensive list of recent new senders, making it easier to spot important contacts and opportunities, while also offering the ability to block unwanted communication effortlessly."
      image="/images/newsletters.png"
      features={featuresNewSenders}
    />
  );
}
