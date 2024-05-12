import { Suspense } from "react";
import { Pricing } from "@/app/(app)/premium/Pricing";

export default function Premium() {
  return (
    <Suspense>
      <div className="pb-20">
        <Pricing />
      </div>
    </Suspense>
  );
}
