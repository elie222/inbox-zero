import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";
import { Testimonial } from "@/app/(landing)/welcome-upgrade/Testimonial";

export default function WelcomeUpgradePage() {
  return (
    <>
      <WelcomeUpgradeNav />
      <PricingLazy showSkipUpgrade header={<WelcomeUpgradeHeader />} />
      <Testimonial />
      <Footer />
    </>
  );
}
