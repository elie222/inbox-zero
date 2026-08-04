import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { Testimonial } from "@/app/(landing)/welcome-upgrade/Testimonial";
import { WelcomeUpgradePricing } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradePricing";

export default function WelcomeUpgradePage() {
  return (
    <>
      <WelcomeUpgradeNav />
      <WelcomeUpgradePricing />
      <div className="mt-8">
        <Testimonial />
      </div>
      {/* The marketing footer is a wall of exits on a page whose only job is
          starting a trial, and on mobile it dwarfs the plans themselves. */}
      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  );
}
