"use client";

import { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PermissionList } from "./PermissionList";
import { TrustBadge } from "@/components/plugins/TrustBadge";
import { RiskIndicator } from "@/components/plugins/RiskIndicator";
import { DataAccessSummary } from "@/components/plugins/DataAccessSummary";
import { installPluginAction } from "@/utils/actions/plugins";
import { toastSuccess, toastError } from "@/components/Toast";
import { formatPermissionSummary } from "@/lib/plugin-runtime/risk-levels";
import type { PluginManifest } from "@/packages/plugin-sdk/src/schemas/plugin-manifest";
import { AlertTriangle, ShieldAlert, ShieldCheck } from "lucide-react";

interface InstallModalProps {
  plugin: PluginManifest & {
    author?: string;
    trustLevel?: "verified" | "community" | "unverified";
    repositoryUrl?: string;
  };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInstallSuccess?: () => void;
}

export function InstallModal({
  plugin,
  open,
  onOpenChange,
  onInstallSuccess,
}: InstallModalProps) {
  const [consentGiven, setConsentGiven] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);

  const permissionSummary = formatPermissionSummary(plugin);
  const hasElevatedPermissions = permissionSummary.dangerLevel === "elevated";
  const riskLevel = mapDangerLevelToRiskLevel(
    permissionSummary.dangerLevel,
    permissionSummary.capabilities.length,
  );

  const handleInstall = useCallback(async () => {
    if (!consentGiven) return;

    setIsInstalling(true);
    try {
      const result = await installPluginAction({
        pluginId: plugin.id,
        repositoryUrl:
          plugin.repositoryUrl || `https://github.com/inbox-zero/${plugin.id}`,
        version: plugin.version,
        versionType: "release",
      });

      if (result?.serverError) {
        toastError({
          title: "Installation failed",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: `${plugin.name} installed successfully` });
        onOpenChange(false);
        setConsentGiven(false);
        onInstallSuccess?.();
      }
    } catch (_error) {
      toastError({
        title: "Installation failed",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsInstalling(false);
    }
  }, [consentGiven, plugin, onOpenChange, onInstallSuccess]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setConsentGiven(false);
  }, [onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            {hasElevatedPermissions ? (
              <ShieldAlert className="h-6 w-6 text-amber-600" />
            ) : (
              <ShieldCheck className="h-6 w-6 text-green-600" />
            )}
            <div className="flex-1">
              <DialogTitle>Review Permissions</DialogTitle>
              <DialogDescription className="mt-1">
                {plugin.name} is requesting access to your data
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-lg">{plugin.name}</div>
              {plugin.author && (
                <div className="text-sm text-muted-foreground">
                  by {plugin.author}
                </div>
              )}
              <div className="text-xs text-muted-foreground mt-1">
                v{plugin.version}
              </div>
            </div>
            {plugin.trustLevel && <TrustBadge level={plugin.trustLevel} />}
          </div>

          {plugin.description && (
            <div className="text-sm text-muted-foreground">
              {plugin.description}
            </div>
          )}

          <div className="rounded-lg border border-border p-4 space-y-3">
            <h3 className="font-semibold text-sm">Overall Risk Level</h3>
            <RiskIndicator level={riskLevel} size="md" />
            <p className="text-sm text-muted-foreground">
              {getRiskMessage(riskLevel)}
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3 flex items-center gap-2">
              Permissions Required
            </h3>
            <PermissionList permissions={permissionSummary.capabilities} />
          </div>

          <DataAccessSummary capabilities={plugin.capabilities ?? []} />

          {hasElevatedPermissions && (
            <Alert className="border-amber-200 bg-amber-50/50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                This plugin requests elevated permissions and can take actions
                on your behalf. Only install if you trust this publisher.
              </AlertDescription>
            </Alert>
          )}

          {plugin.trustLevel === "unverified" && (
            <Alert
              variant="destructive"
              className="border-red-200 bg-red-50/50"
            >
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                This plugin is from an unverified source. It has not been
                reviewed by the Inbox Zero team. Install at your own risk.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-4">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked) => setConsentGiven(checked === true)}
              disabled={isInstalling}
            />
            <Label
              htmlFor="consent"
              className="text-sm font-normal leading-tight cursor-pointer"
            >
              I understand this plugin can access my data as described above and
              agree to grant these permissions
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={isInstalling}
          >
            Cancel
          </Button>
          <Button
            onClick={handleInstall}
            disabled={!consentGiven || isInstalling}
            loading={isInstalling}
          >
            {isInstalling ? "Installing..." : "Allow & Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function mapDangerLevelToRiskLevel(
  dangerLevel: "standard" | "elevated",
  capabilityCount: number,
): "low" | "medium" | "high" {
  if (dangerLevel === "elevated") {
    return "high";
  }
  return capabilityCount === 0 ? "low" : "medium";
}

function getRiskMessage(level: "low" | "medium" | "high"): string {
  switch (level) {
    case "low":
      return "This plugin has minimal access to your data.";
    case "medium":
      return "This plugin can read your email content. Only install if you trust this publisher.";
    case "high":
      return "This plugin requests sensitive permissions. Proceed with caution.";
  }
}
