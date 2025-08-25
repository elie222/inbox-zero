import { PricingLazy } from "@/app/(app)/premium/PricingLazy";
import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { WelcomeUpgradeHeader } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeHeader";

export default function WelcomeUpgradePage() {
  return (
    <>
      <WelcomeUpgradeNav />
      <PricingLazy showSkipUpgrade header={<WelcomeUpgradeHeader />} />
      <Footer />
    </>
  );
}
