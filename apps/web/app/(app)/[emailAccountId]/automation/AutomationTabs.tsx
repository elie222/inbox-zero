"use client";

import { useCallback, useEffect, useRef } from "react";
import { useQueryState } from "nuqs";
import { useSWRConfig } from "swr";
import { TabSelect } from "@/components/TabSelect";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTabNew";

const automationTabs = ["rules", "test", "history", "settings"] as const;
type AutomationTab = (typeof automationTabs)[number];

const defaultTab: AutomationTab = "rules";

const tabOptions = [
  {
    id: "rules",
    label: "Rules",
  },
  {
    id: "test",
    label: "Test",
  },
  {
    id: "history",
    label: "History",
  },
  {
    id: "settings",
    label: "Settings",
  },
] satisfies { id: AutomationTab; label: string }[];

export function AutomationTabs() {
  const [tab, setTab] = useQueryState("tab", {
    defaultValue: defaultTab,
    history: "push",
  });
  const selectedTab = isAutomationTab(tab) ? tab : defaultTab;
  usePrefetchTestTab(selectedTab);

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

      <div className="mb-10">
        {selectedTab === "rules" && <RulesTab />}
        {selectedTab === "settings" && <SettingsTab />}
        {selectedTab === "test" && <Process />}
        {selectedTab === "history" && <History />}
      </div>
    </>
  );
}

function usePrefetchTestTab(selectedTab: AutomationTab) {
  const { fetcher, mutate } = useSWRConfig();
  const hasPrefetchedRef = useRef(false);

  useEffect(() => {
    if (
      hasPrefetchedRef.current ||
      selectedTab === "test" ||
      typeof fetcher !== "function"
    ) {
      return;
    }
    hasPrefetchedRef.current = true;

    const prefetch = () => {
      fetcher("/api/messages")
        .then((data) => mutate("/api/messages", data, { revalidate: false }))
        .catch(() => undefined);
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(prefetch, { timeout: 1500 });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(prefetch, 500);
    return () => window.clearTimeout(timeoutId);
  }, [fetcher, mutate, selectedTab]);
}

function isAutomationTab(value: string): value is AutomationTab {
  return automationTabs.includes(value as AutomationTab);
}
