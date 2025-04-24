import { Suspense } from "react";
import { Pricing } from "@/app/(app)/[account]/premium/Pricing";

export default function Premium() {
  return (
    <Suspense>
      <div className="bg-white pb-20">
        <Pricing />
      </div>
    </Suspense>
  );
}
