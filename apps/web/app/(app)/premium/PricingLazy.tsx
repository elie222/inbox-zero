import { Loading } from "@/components/Loading";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import type { PricingProps } from "./Pricing";

const PricingComponent = dynamic(() => import("./Pricing"));

export const PricingLazy = (props: PricingProps) => (
  <Suspense fallback={<Loading />}>
    <PricingComponent {...props} />
  </Suspense>
);
