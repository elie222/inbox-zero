"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  EXTENSION_URL,
  TABS_EXTENSION_ID,
} from "@/utils/config";
import { mapRulesToExtensionTabs } from "@/utils/rule/mapRulesToExtensionTabs";
import type { RulesResponse } from "@/app/api/user/rules/route";

interface SyncResponse {
  success: boolean;
  summary?: { enabled: number; created: number; skipped: number };
  error?: string;
}

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        lastError?: { message: string };
        sendMessage: (
          extensionId: string,
          message: { action: string; tabs?: unknown[]; accountIndex?: string },
          callback: (response: SyncResponse) => void,
        ) => void;
      };
    };
  }
}

function sendMessageToExtension(
  message: { action: string; tabs?: unknown[]; accountIndex?: string },
): Promise<SyncResponse> {
  return new Promise((resolve, reject) => {
    if (!window.chrome?.runtime?.sendMessage) {
      reject(new Error("not_chrome"));
      return;
    }
    try {
      window.chrome.runtime.sendMessage(
        TABS_EXTENSION_ID,
        message,
        (response) => {
          if (window.chrome?.runtime?.lastError) {
            reject(new Error("extension_not_found"));
            return;
          }
          resolve(response);
        },
      );
    } catch {
      reject(new Error("extension_not_found"));
    }
  });
}

export function SyncToExtensionButton({
  rules,
}: {
  rules: RulesResponse;
}) {
  const [isSyncing, setIsSyncing] = useState(false);

  async function handleSync() {
    const tabs = mapRulesToExtensionTabs(rules);

    if (tabs.length === 0) {
      toast.info("No rules with label actions to sync");
      return;
    }

    setIsSyncing(true);
    try {
      await sendMessageToExtension({ action: "ping" });

      const result = await sendMessageToExtension({
        action: "syncTabs",
        tabs,
      });

      if (result.success && result.summary) {
        const parts: string[] = [];
        if (result.summary.enabled > 0)
          parts.push(`${result.summary.enabled} enabled`);
        if (result.summary.created > 0)
          parts.push(`${result.summary.created} created`);
        if (result.summary.skipped > 0)
          parts.push(`${result.summary.skipped} already existed`);
        toast.success(`Synced tabs to extension: ${parts.join(", ")}`);
      } else {
        toast.error("Failed to sync tabs to extension");
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "not_chrome"
      ) {
        toast.error("Syncing to extension requires a Chromium browser");
      } else {
        toast.error("Inbox Zero Tabs extension not found. Install it first.", {
          action: {
            label: "Install",
            onClick: () => window.open(EXTENSION_URL, "_blank"),
          },
        });
      }
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={handleSync} disabled={isSyncing}>
      <DownloadIcon className="mr-2 hidden size-4 md:block" />
      {isSyncing ? "Syncing..." : "Sync to Extension"}
    </Button>
  );
}
