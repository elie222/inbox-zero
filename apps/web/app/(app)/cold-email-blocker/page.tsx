"use client";

import { ColdEmailList } from "@/app/(app)/cold-email-blocker/ColdEmailList";
import { ColdEmailSettings } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";
import { PremiumAlert, usePremium } from "@/components/PremiumAlert";
import { TopSection } from "@/components/TopSection";
import { TypographyH3 } from "@/components/Typography";

export default function ColdEmailBlockerPage() {
  const { isLoading, isProPlanWithoutApiKey, hasColdEmailAccess } =
    usePremium();

  return (
    <div>
      <TopSection
        title="Cold Email Blocker"
        descriptionComponent={
          <>
            {!hasColdEmailAccess && !isLoading && (
              <div className="mt-4 max-w-prose">
                <PremiumAlert showSetApiKey={isProPlanWithoutApiKey} />
              </div>
            )}
          </>
        }
      />
      <div className="content-container border-b border-gray-200 bg-white py-4 shadow-sm">
        <ColdEmailSettings />
      </div>
      <div className="content-container border-b border-gray-200 bg-white py-4 shadow-sm">
        <TypographyH3>Cold Emails</TypographyH3>
      </div>
      <ColdEmailList />
    </div>
  );
}
