"use client";

import { useIsClient, useLocalStorage } from "usehooks-ts";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/Tabs";
import { RulesSection } from "@/app/(app)/automation/RulesSection";
import { SectionDescription } from "@/components/Typography";
import { TopSection } from "@/components/TopSection";
import { PremiumAlert, usePremium } from "@/components/PremiumAlert";
import { Planned } from "@/app/(app)/automation/Planned";
import { PlanHistory } from "@/app/(app)/automation/PlanHistory";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PremiumTier } from "@prisma/client";

export default function PlannedPage() {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "history";

  const { isPremium, isLoading, data } = usePremium();

  const isProPlanWithoutApiKey =
    (data?.premium?.tier === PremiumTier.PRO_MONTHLY ||
      data?.premium?.tier === PremiumTier.PRO_ANNUALLY) &&
    !data?.openAIApiKey;

  const [expandRules, setExpandRules] = useLocalStorage(
    "automationRulesExpanded",
    true,
  );
  const toggleExpandRules = () => setExpandRules((prev) => !prev);

  // prevent hydration error from localStorage
  const isClient = useIsClient();
  if (!isClient) return null;

  return (
    <div className="relative">
      <>
        {expandRules ? (
          <>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleExpandRules}
              className="absolute right-2 top-2"
            >
              <Minimize2Icon className="h-4 w-4" />
            </Button>

            <TopSection
              title="AI Automation"
              descriptionComponent={
                <>
                  <SectionDescription>
                    Set rules for our AI to handle incoming emails
                    automatically.
                  </SectionDescription>
                  <SectionDescription>
                    Run in planning mode to see what the AI would do without it
                    actually doing anything. Alternatively, activate automated
                    mode to enable the AI to automatically process your emails.
                  </SectionDescription>
                  {(!isPremium || isProPlanWithoutApiKey) && !isLoading && (
                    <div className="mt-4">
                      <PremiumAlert showSetApiKey={isProPlanWithoutApiKey} />
                    </div>
                  )}
                </>
              }
            />

            <div className="border-b border-gray-200 bg-white shadow-sm">
              <RulesSection />
            </div>
          </>
        ) : (
          <Button
            variant="outline"
            onClick={toggleExpandRules}
            className="absolute right-2 top-2"
          >
            <Maximize2Icon className="mr-2 h-4 w-4" />
            Set AI Rules
          </Button>
        )}
      </>

      <div className="mb-8">
        <div className="mx-2 my-2 sm:mx-6">
          <Tabs
            selected={selectedTab}
            tabs={[
              {
                label: "History",
                value: "history",
                href: "/automation?tab=history",
              },
              {
                label: "Planned",
                value: "planned",
                href: "/automation?tab=planned",
              },
            ]}
            breakpoint="xs"
          />
        </div>

        {selectedTab === "history" && <PlanHistory />}
        {selectedTab === "planned" && <Planned />}
      </div>
    </div>
  );
}
