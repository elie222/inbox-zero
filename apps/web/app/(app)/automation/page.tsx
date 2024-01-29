"use client";

import { useIsClient, useLocalStorage } from "usehooks-ts";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
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
import { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
import { PlannedResponse } from "@/app/api/user/planned/route";

export default function PlannedPage() {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "planned";

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

  // could pass this data into tabs too
  const { data: historyData } = useSWR<PlanHistoryResponse>(
    "/api/user/planned/history",
    {
      keepPreviousData: true,
    },
  );
  const { data: plannedData } = useSWR<PlannedResponse>("/api/user/planned", {
    keepPreviousData: true,
    dedupingInterval: 1_000,
  });

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
                    Use {`"Confirmation Mode"`} to preview the AI{"'"}s planned
                    actions without immediate execution.
                  </SectionDescription>
                  <SectionDescription>
                    For hands-free operation, switch to {`"Automated Mode"`},
                    enabling the AI to process your emails autonomously.
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
                label:
                  "Planned" +
                  (plannedData?.messages.length
                    ? ` (${plannedData?.messages.length})`
                    : ""),
                value: "planned",
                href: "/automation?tab=planned",
              },
              {
                label:
                  "History" +
                  (historyData?.history.length
                    ? ` (${historyData?.history.length})`
                    : ""),
                value: "history",
                href: "/automation?tab=history",
              },
            ]}
            breakpoint="xs"
          />
        </div>

        {selectedTab === "planned" && <Planned />}
        {selectedTab === "history" && <PlanHistory />}
      </div>
    </div>
  );
}
