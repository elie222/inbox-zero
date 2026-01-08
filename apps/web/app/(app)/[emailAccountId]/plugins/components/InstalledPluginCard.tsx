"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import { PluginPermissionBadge } from "@/components/plugins/PluginPermissionBadge";
import { formatPermissionSummary } from "@/lib/plugin-runtime/risk-levels";
import { SettingsIcon, AlertCircleIcon, ClockIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PluginStatusDropdown } from "./PluginStatusDropdown";
import { UninstallDialog } from "./UninstallDialog";
import type { InstalledPluginsResponse } from "@/app/api/plugins/installed/route";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";

interface InstalledPluginCardProps {
  plugin: InstalledPluginsResponse["plugins"][0];
  catalogPlugin?: PluginManifest & {
    author?: string;
    trustLevel?: "verified" | "community" | "unverified";
  };
  hasUpdate: boolean;
  onUpdate: () => void;
}

export function InstalledPluginCard({
  plugin,
  catalogPlugin,
  hasUpdate,
  onUpdate,
}: InstalledPluginCardProps) {
  const [uninstallDialogOpen, setUninstallDialogOpen] = useState(false);

  const permissionSummary = catalogPlugin
    ? formatPermissionSummary(catalogPlugin)
    : null;

  // calculate last run time
  const lastRunText = plugin.lastRunAt
    ? formatRelativeTime(new Date(plugin.lastRunAt))
    : "Never";

  // calculate error count (mock data for now)
  const errorCount = 0;

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-semibold text-foreground">
              {catalogPlugin?.name || plugin.id}
            </h3>
            <Badge color="gray">v{plugin.version}</Badge>
            {hasUpdate && catalogPlugin && (
              <Badge color="yellow">Update: v{catalogPlugin.version}</Badge>
            )}
          </div>
          {catalogPlugin?.author && (
            <p className="mb-2 text-sm text-muted-foreground">
              by {catalogPlugin.author}
            </p>
          )}
          {catalogPlugin?.description && (
            <p className="mb-2 text-sm text-muted-foreground">
              {catalogPlugin.description}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {catalogPlugin && (
            <>
              <TrustBadge level={catalogPlugin.trustLevel || "unverified"} />
              {permissionSummary && (
                <PluginPermissionBadge
                  dangerLevel={permissionSummary.dangerLevel}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1">
          <ClockIcon className="h-3.5 w-3.5" />
          <span>Last run: {lastRunText}</span>
        </div>
        {errorCount > 0 && (
          <div className="flex items-center gap-1 text-destructive">
            <AlertCircleIcon className="h-3.5 w-3.5" />
            <span>{errorCount} errors</span>
          </div>
        )}
        {errorCount === 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <span>0 errors</span>
          </div>
        )}
      </div>

      {!plugin.enabled && (
        <div className="mb-3 text-sm text-muted-foreground">
          Disabled by user
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1">
          <PluginStatusDropdown
            pluginId={plugin.id}
            enabled={plugin.enabled}
            onUpdate={onUpdate}
          />
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link
            href={`/plugins/settings/${plugin.id}`}
            aria-label="Plugin settings"
          >
            <SettingsIcon className="mr-2 size-4" />
            Settings
          </Link>
        </Button>
        <UninstallDialog
          pluginId={plugin.id}
          pluginName={catalogPlugin?.name || plugin.id}
          open={uninstallDialogOpen}
          onOpenChange={setUninstallDialogOpen}
          onSuccess={onUpdate}
        />
      </div>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) {
    return "Just now";
  }
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "min" : "mins"} ago`;
  }
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  }
  if (days < 7) {
    return `${days} ${days === 1 ? "day" : "days"} ago`;
  }

  return date.toLocaleDateString();
}
