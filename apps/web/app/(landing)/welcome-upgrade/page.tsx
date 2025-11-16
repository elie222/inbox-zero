import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { Testimonial } from "@/app/(landing)/welcome-upgrade/Testimonial";
import { OldPricingLazy } from "@/app/(app)/premium/OldPricingLazy";

export default function WelcomeUpgradePage() {
  return (
    <>
      <WelcomeUpgradeNav />
      <OldPricingLazy />
      <div className="mt-8">
        <Testimonial />
      </div>
      <Footer />
    </>
  );
}
