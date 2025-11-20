import { AppPricingLazy } from "@/app/(app)/premium/AppPricingLazy";

export default function Premium() {
  return (
    <div className="bg-white pb-20">
      <AppPricingLazy showSkipUpgrade />
    </div>
  );
}
