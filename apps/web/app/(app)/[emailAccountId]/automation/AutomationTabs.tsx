"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { TabSelect } from "@/components/TabSelect";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTabNew";
import { ThunderbirdPendingReview } from "@/app/(app)/[emailAccountId]/automation/ThunderbirdPendingReview";
import { useInfiniteMessages } from "@/hooks/useMessages";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isThunderbirdProvider } from "@/utils/email/provider-types";

const automationTabs = [
  "rules",
  "pending",
  "test",
  "history",
  "settings",
] as const;
type AutomationTab = (typeof automationTabs)[number];

const defaultTab: AutomationTab = "rules";

export function AutomationTabs() {
  const { provider } = useAccount();
  const isThunderbird = isThunderbirdProvider(provider);
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: defaultTab,
    history: "push",
  });
  const selectedTab = isAutomationTab(tab)
    ? tab === "pending" && !isThunderbird
      ? defaultTab
      : tab
    : defaultTab;
  usePrefetchTestTabMessages(selectedTab);

  const tabOptions = [
    { id: "rules" as const, label: "Rules" },
    ...(isThunderbird
      ? [{ id: "pending" as const, label: "Pending" }]
      : []),
    { id: "test" as const, label: "Test" },
    { id: "history" as const, label: "History" },
    { id: "settings" as const, label: "Settings" },
  ];

  const onSelect = useCallback(
    (value: AutomationTab) => {
      setTab(value === defaultTab ? null : value);
    },
    [setTab],
  );

  return (
    <>
      <div className="border-b border-neutral-200 pt-2">
        <TabSelect
          options={tabOptions}
          selected={selectedTab}
          onSelect={onSelect}
        />
      </div>

      <div className="mt-2 mb-10">
        {selectedTab === "rules" && <RulesTab />}
        {selectedTab === "pending" && isThunderbird && (
          <ThunderbirdPendingReview />
        )}
        {selectedTab === "settings" && <SettingsTab />}
        {selectedTab === "test" && <Process />}
        {selectedTab === "history" && <History />}
      </div>
    </>
  );
}

function usePrefetchTestTabMessages(selectedTab: AutomationTab) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  useInfiniteMessages({ enabled: shouldPrefetch });

  useEffect(() => {
    if (shouldPrefetch || selectedTab === "test") return;

    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => setShouldPrefetch(true), {
        timeout: 1500,
      });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(() => setShouldPrefetch(true), 500);
    return () => window.clearTimeout(timeoutId);
  }, [selectedTab, shouldPrefetch]);
}

function isAutomationTab(value: string): value is AutomationTab {
  return automationTabs.includes(value as AutomationTab);
}
