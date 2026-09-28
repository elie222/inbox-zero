import { Loading } from "@/components/Loading";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const PricingComponent = dynamic(() =>
  import("../../../components/new-landing/sections/Pricing").then((mod) => ({
    default: mod.Pricing,
  })),
);

export const PricingLazy = () => (
  <Suspense fallback={<Loading />}>
    <PricingComponent />
  </Suspense>
);
