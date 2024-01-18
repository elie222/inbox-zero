"use client";

import { ColdEmailList } from "@/app/(app)/cold-email-blocker/ColdEmailList";
import { ColdEmailSettings } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";
import { PremiumAlert, usePremium } from "@/components/PremiumAlert";
import { TopSection } from "@/components/TopSection";

export default function ColdEmailBlockerPage() {
  const { isPremium, isLoading } = usePremium();

  return (
    <div>
      <TopSection
        title="Cold Email Blocker"
        descriptionComponent={
          <>
            {!isPremium && !isLoading && (
              <div className="mt-4">
                <PremiumAlert />
              </div>
            )}
          </>
        }
      />
      <div className="border-b border-gray-200 bg-white px-4 py-6 shadow-sm sm:px-6 lg:px-8">
        <ColdEmailSettings />
      </div>
      <ColdEmailList />
    </div>
  );
}
