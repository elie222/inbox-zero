"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { PluginPermissionBadge } from "@/components/plugins/PluginPermissionBadge";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import {
  PopularBadge,
  NewBadge,
  AIBadge,
} from "@/components/plugins/PluginBadges";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  togglePluginEnabledAction,
  updatePluginAction,
} from "@/utils/actions/plugins";
import { formatPermissionSummary } from "@/lib/plugin-runtime/risk-levels";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import { CheckCircle2, Info, Power, PowerOff, RefreshCw } from "lucide-react";

interface PluginCardProps {
  plugin: PluginManifest & {
    author?: string;
    trustLevel?: "verified" | "community" | "unverified";
    isPopular?: boolean;
    isNew?: boolean;
    isAIPowered?: boolean;
  };
  isInstalled: boolean;
  installedVersion?: string;
  isEnabled: boolean;
  hasUpdate?: boolean;
  onUpdate: () => void;
}

export function PluginCard({
  plugin,
  isInstalled,
  installedVersion,
  isEnabled,
  hasUpdate,
  onUpdate,
}: PluginCardProps) {
  const params = useParams();
  const router = useRouter();
  const emailAccountId = params.emailAccountId as string;
  const [isActionLoading, setIsActionLoading] = useState(false);
  const permissionSummary = formatPermissionSummary(plugin);

  const handleViewDetails = () => {
    router.push(`/${emailAccountId}/plugins/${plugin.id}`);
  };

  const handleUpdate = async () => {
    setIsActionLoading(true);
    try {
      const result = await updatePluginAction({ pluginId: plugin.id });
      if (result?.serverError) {
        toastError({
          title: "Update failed",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: `${plugin.name} updated successfully` });
        onUpdate();
      }
    } catch (_error) {
      toastError({
        title: "Update failed",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsActionLoading(true);
    try {
      const result = await togglePluginEnabledAction({
        pluginId: plugin.id,
        enabled,
      });
      if (result?.serverError) {
        toastError({
          title: enabled ? "Enable failed" : "Disable failed",
          description: result.serverError,
        });
      } else {
        toastSuccess({
          description: `${plugin.name} ${enabled ? "enabled" : "disabled"}`,
        });
        onUpdate();
      }
    } catch (_error) {
      toastError({
        title: enabled ? "Enable failed" : "Disable failed",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between">
        <button
          type="button"
          className="flex-1 cursor-pointer text-left"
          onClick={handleViewDetails}
        >
          <h3 className="font-semibold text-foreground hover:text-primary transition-colors">
            {plugin.name}
          </h3>
          {plugin.author && (
            <p className="text-sm text-muted-foreground">by {plugin.author}</p>
          )}
        </button>
        <div className="flex flex-col gap-1">
          <TrustBadge level={plugin.trustLevel || "unverified"} />
          <PluginPermissionBadge dangerLevel={permissionSummary.dangerLevel} />
        </div>
      </div>

      {plugin.description && (
        <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
          {plugin.description}
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge color="gray">v{plugin.version}</Badge>
        {plugin.isPopular && <PopularBadge />}
        {plugin.isNew && <NewBadge />}
        {plugin.isAIPowered && <AIBadge />}
        {isInstalled &&
          installedVersion &&
          installedVersion !== plugin.version && (
            <Badge color="blue">Installed: v{installedVersion}</Badge>
          )}
        {isEnabled && (
          <Badge color="green">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Active
          </Badge>
        )}
        {hasUpdate && <Badge color="yellow">Update Available</Badge>}
      </div>

      <div className="mt-auto flex gap-2">
        {!isInstalled ? (
          <Button
            onClick={handleViewDetails}
            variant="outline"
            className="flex-1"
            size="sm"
            Icon={Info}
          >
            View Details
          </Button>
        ) : (
          <>
            <Button
              onClick={handleViewDetails}
              variant="outline"
              size="sm"
              Icon={Info}
              className="flex-1"
            >
              Details
            </Button>
            {hasUpdate && (
              <Button
                onClick={handleUpdate}
                loading={isActionLoading}
                variant="outline"
                size="sm"
                Icon={RefreshCw}
              >
                Update
              </Button>
            )}
            {isEnabled ? (
              <Button
                onClick={() => handleToggleEnabled(false)}
                loading={isActionLoading}
                variant="outline"
                size="sm"
                Icon={PowerOff}
              >
                Disable
              </Button>
            ) : (
              <Button
                onClick={() => handleToggleEnabled(true)}
                loading={isActionLoading}
                size="sm"
                Icon={Power}
              >
                Enable
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
