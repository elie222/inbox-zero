"use client";

import { useCallback, useEffect, useState } from "react";
import { useQueryState } from "nuqs";
import { msg } from "@lingui/core/macro";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import { TabSelect } from "@/components/TabSelect";
import { History } from "@/app/(app)/[emailAccountId]/assistant/History";
import { Process } from "@/app/(app)/[emailAccountId]/assistant/Process";
import { SettingsTab } from "@/app/(app)/[emailAccountId]/assistant/settings/SettingsTab";
import { RulesTab } from "@/app/(app)/[emailAccountId]/assistant/RulesTabNew";
import { useInfiniteMessages } from "@/hooks/useMessages";

const automationTabs = ["rules", "test", "history", "settings"] as const;
type AutomationTab = (typeof automationTabs)[number];

const defaultTab: AutomationTab = "rules";

const tabOptions = [
  {
    id: "rules",
    label: msg`Rules`,
  },
  {
    id: "test",
    label: msg`Test`,
  },
  {
    id: "history",
    label: msg`History`,
  },
  {
    id: "settings",
    label: msg`Settings`,
  },
] satisfies { id: AutomationTab; label: MessageDescriptor }[];

export function AutomationTabs() {
  const { i18n } = useLingui();
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
          options={tabOptions.map((option) => ({
            ...option,
            label: i18n._(option.label),
          }))}
          selected={selectedTab}
          onSelect={onSelect}
        />
      </div>

      <div className="mt-2 mb-10">
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
