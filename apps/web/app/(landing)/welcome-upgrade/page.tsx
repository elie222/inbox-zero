import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import { buildLoginRedirectUrl } from "@/utils/redirect";
import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { Testimonial } from "@/app/(landing)/welcome-upgrade/Testimonial";
import { WelcomeUpgradePricing } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradePricing";

export default async function WelcomeUpgradePage() {
  const session = await auth();
  if (!session?.user) redirect(buildLoginRedirectUrl("/welcome-upgrade"));

  return (
    <>
      <WelcomeUpgradeNav />
      <WelcomeUpgradePricing />
      <div className="mt-8">
        <Testimonial />
      </div>
      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  );
}
