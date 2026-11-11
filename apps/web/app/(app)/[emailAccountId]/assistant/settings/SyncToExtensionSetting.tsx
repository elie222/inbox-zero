"use client";

import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EXTENSION_URL } from "@/utils/config";
import { env } from "@/env";
import {
  mapRulesToExtensionTabs,
  type SyncTab,
} from "@/utils/rule/mapRulesToExtensionTabs";
import { useRules } from "@/hooks/useRules";
import { SettingCard } from "@/components/SettingCard";

interface SyncResponse {
  error?: string;
  success: boolean;
  summary?: { enabled: number; created: number; skipped: number };
}

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        lastError?: { message: string };
        sendMessage: (
          extensionId: string,
          message: { action: string; tabs?: SyncTab[]; accountIndex?: string },
          callback: (response: SyncResponse) => void,
        ) => void;
      };
    };
  }
}

function sendMessageToExtension(message: {
  action: string;
  tabs?: SyncTab[];
  accountIndex?: string;
}): Promise<SyncResponse> {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.runtime?.sendMessage) {
      reject(new Error("not_chrome"));
      return;
    }
    if (!EXTENSION_ID) {
      reject(new Error("not_chrome"));
      return;
    }
    try {
      window.chrome.runtime.sendMessage(EXTENSION_ID, message, (response) => {
        if (window.chrome?.runtime?.lastError) {
          reject(new Error("extension_not_found"));
          return;
        }
        resolve(response);
      });
    } catch {
      reject(new Error("extension_not_found"));
    }
  });
}

const EXTENSION_ID = env.NEXT_PUBLIC_TABS_EXTENSION_ID;

export function SyncToExtensionSetting() {
  const { t } = useLingui();
  const { data: rules } = useRules();
  const [open, setOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deselected, setDeselected] = useState<Set<string>>(new Set());

  const allTabs = useMemo(() => mapRulesToExtensionTabs(rules || []), [rules]);

  function getTabKey(tab: SyncTab) {
    return tab.type === "enable_default" ? tab.tabId : tab.displayLabel;
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen) setDeselected(new Set());
    setOpen(nextOpen);
  }

  function toggleTab(tab: SyncTab) {
    const key = getTabKey(tab);
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const selectedTabs = allTabs.filter((tab) => !deselected.has(getTabKey(tab)));

  async function handleSync() {
    if (selectedTabs.length === 0) {
      toast.info(t`No tabs selected`);
      return;
    }

    setIsSyncing(true);
    try {
      await sendMessageToExtension({ action: "ping" });

      const result = await sendMessageToExtension({
        action: "syncTabs",
        tabs: selectedTabs,
      });

      if (result.success && result.summary) {
        const { enabled, created, skipped } = result.summary;
        const parts: string[] = [];
        if (enabled > 0) parts.push(t`${enabled} enabled`);
        if (created > 0) parts.push(t`${created} created`);
        if (skipped > 0) parts.push(t`${skipped} already existed`);
        const summary = parts.join(", ");
        toast.success(t`Synced tabs to extension: ${summary}`);
      } else {
        toast.error(t`Failed to sync tabs to extension`);
      }
      setOpen(false);
    } catch (error) {
      if (error instanceof Error && error.message === "not_chrome") {
        toast.error(t`Syncing to extension requires a Chromium browser`);
      } else {
        toast.error(t`Inbox Zero Tabs extension not found. Install it first.`, {
          action: {
            label: t`Install`,
            onClick: () => window.open(EXTENSION_URL, "_blank"),
          },
        });
      }
    } finally {
      setIsSyncing(false);
    }
  }

  if (!EXTENSION_ID) return null;

  return (
    <SettingCard
      title={t`Sync to browser extension`}
      description={t`Sync your rules to the Inbox Zero Tabs browser extension. Each label rule becomes a tab in Gmail.`}
      right={
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Trans>Sync</Trans>
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                <Trans>Sync tabs to extension</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>Select which label rules to sync as Gmail tabs.</Trans>
              </DialogDescription>
            </DialogHeader>

            {allTabs.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">
                <Trans>No rules with label actions found.</Trans>
              </p>
            ) : (
              <div className="space-y-2 py-2">
                {allTabs.map((tab) => {
                  const key = getTabKey(tab);
                  const checkboxId = `sync-tab-${encodeURIComponent(key)}`;
                  const checked = !deselected.has(key);
                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        onCheckedChange={() => toggleTab(tab)}
                      />
                      <label
                        htmlFor={checkboxId}
                        className="cursor-pointer text-sm font-medium"
                      >
                        {tab.displayLabel}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            <DialogFooter>
              <Button
                onClick={handleSync}
                loading={isSyncing}
                disabled={selectedTabs.length === 0}
              >
                {t`Sync ${plural(selectedTabs.length, { one: "# tab", other: "# tabs" })}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      }
    />
  );
}
