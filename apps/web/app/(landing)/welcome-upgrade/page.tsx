import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";
import { Testimonial } from "@/app/(landing)/welcome-upgrade/Testimonial";
import { AppPricingLazy } from "@/app/(app)/premium/AppPricingLazy";

export default function WelcomeUpgradePage() {
  return (
    <>
      <WelcomeUpgradeNav />
      <AppPricingLazy showSkipUpgrade header={<WelcomeUpgradeHeader />} />
      <div className="mt-8">
        <Testimonial />
      </div>
      <Footer />
    </>
  );
}
