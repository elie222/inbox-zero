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
      <Footer />
    </>
  );
}
