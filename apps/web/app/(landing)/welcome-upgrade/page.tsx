import { redirect } from "next/navigation";
import { auth } from "@/utils/auth";
import { buildLoginRedirectUrl } from "@/utils/redirect";
import { Footer } from "@/app/(landing)/home/Footer";
import { WelcomeUpgradeNav } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradeNav";
import { Testimonial } from "@/app/(landing)/welcome-upgrade/Testimonial";
import { WelcomeUpgradePricing } from "@/app/(landing)/welcome-upgrade/WelcomeUpgradePricing";
import {
  CHECKOUT_RETURN_TO_PARAM,
  checkoutReturnToSchema,
} from "@/utils/actions/premium.validation";

export default async function WelcomeUpgradePage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect(buildLoginRedirectUrl("/welcome-upgrade"));

  const searchParams = await props.searchParams;
  const returnTo = checkoutReturnToSchema.safeParse(
    searchParams[CHECKOUT_RETURN_TO_PARAM],
  );

  return (
    <>
      <WelcomeUpgradeNav />
      <WelcomeUpgradePricing
        checkoutReturnTo={returnTo.success ? returnTo.data : undefined}
      />
      <div className="mt-8">
        <Testimonial />
      </div>
      <div className="hidden md:block">
        <Footer />
      </div>
    </>
  );
}
