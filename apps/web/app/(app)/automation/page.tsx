"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tabs } from "@/components/Tabs";
import { RulesSection } from "@/app/(app)/automation/RulesSection";
import { SectionDescription, SectionHeader } from "@/components/Typography";
import { TopSection } from "@/components/TopSection";
import { PremiumAlert, usePremium } from "@/components/PremiumAlert";
import { Planned } from "@/app/(app)/automation/Planned";
import { PlanHistory } from "@/app/(app)/automation/PlanHistory";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PlannedPage() {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "planned";

  const { isPremium } = usePremium();

  const [expandRules, setExpandRules] = useState(true);
  const toggleExpandRules = () => setExpandRules((prev) => !prev);

  return (
    <div>
      <TopSection
        title="AI Automation"
        descriptionComponent={
          <>
            <SectionDescription>
              Set rules for our AI to handle incoming emails automatically.
            </SectionDescription>
            <SectionDescription>
              Run in planning mode to see what the AI would do without it
              actually doing anything. Alternatively, activate automated mode to
              enable the AI to automatically process your emails.
            </SectionDescription>
            {!isPremium && (
              <div className="mt-4">
                <PremiumAlert />
              </div>
            )}
          </>
        }
      />

      <div className="relative border-b border-gray-200 bg-white shadow-sm">
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
            <RulesSection />
          </>
        ) : (
          <div className="flex h-[55px] items-center py-2 pl-6">
            <SectionHeader>Set AI Rules</SectionHeader>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleExpandRules}
              className="absolute right-2 top-2"
            >
              <Maximize2Icon className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="mb-8 sm:px-4">
        <div className="py-2">
          <Tabs
            selected={selectedTab}
            tabs={[
              {
                label: "Planned",
                value: "planned",
                href: "/automation?tab=planned",
              },
              {
                label: "History",
                value: "history",
                href: "/automation?tab=history",
              },
            ]}
            breakpoint="md"
          />
        </div>

        {selectedTab === "planned" && <Planned />}
        {selectedTab === "history" && <PlanHistory />}
      </div>
    </div>
  );
}
