"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { TabSelect } from "@/components/TabSelect";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTabNew";
import { useMessages } from "@/hooks/useMessages";

const automationTabs = ["rules", "test", "history", "settings"] as const;
type AutomationTab = (typeof automationTabs)[number];
type IdleWindow = Window &
  typeof globalThis & {
    requestIdleCallback?: (
      callback: IdleRequestCallback,
      options?: IdleRequestOptions,
    ) => number;
    cancelIdleCallback?: (handle: number) => void;
  };

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
  usePrefetchTestTabMessages(selectedTab);

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

function usePrefetchTestTabMessages(selectedTab: AutomationTab) {
  const [shouldPrefetch, setShouldPrefetch] = useState(false);
  useMessages({ enabled: shouldPrefetch });

  useEffect(() => {
    if (shouldPrefetch || selectedTab === "test") return;

    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
      const idleId = idleWindow.requestIdleCallback(
        () => setShouldPrefetch(true),
        { timeout: 1500 },
      );
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => setShouldPrefetch(true), 500);
    return () => globalThis.clearTimeout(timeoutId);
  }, [selectedTab, shouldPrefetch]);
}

function isAutomationTab(value: string): value is AutomationTab {
  return automationTabs.includes(value as AutomationTab);
}
