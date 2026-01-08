"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/Badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { updatePluginAction } from "@/utils/actions/plugins";
import { toastSuccess, toastError } from "@/components/Toast";
import {
  ArrowRight,
  Loader2,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import type { PermissionChanges } from "@/app/api/user/plugins/updates/route";

interface PluginUpdate {
  id: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  changelog?: {
    new?: string[];
    improved?: string[];
    fixed?: string[];
  };
  permissionChanges?: PermissionChanges;
}

interface UpdateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  updates: PluginUpdate[];
  onUpdate: () => void;
}

export function UpdateModal({
  open,
  onOpenChange,
  updates,
  onUpdate,
}: UpdateModalProps) {
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [consentGiven, setConsentGiven] = useState(false);

  const selectedUpdate =
    updates.find((u) => u.id === selectedPluginId) || updates[0];

  const hasNewPermissions =
    selectedUpdate?.permissionChanges?.hasNewPermissions ?? false;

  // reset consent when selecting a different plugin
  useEffect(() => {
    setConsentGiven(false);
  }, [selectedPluginId]);

  const handleUpdate = async (pluginId: string) => {
    setIsUpdating(true);
    try {
      const result = await updatePluginAction({ pluginId });
      if (result?.serverError) {
        toastError({
          title: "Update failed",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: "Plugin updated successfully" });
        onUpdate();
        if (updates.length === 1) {
          onOpenChange(false);
        }
      }
    } catch {
      toastError({
        title: "Update failed",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (!selectedUpdate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plugin Updates</DialogTitle>
          <DialogDescription>
            {updates.length} update{updates.length > 1 ? "s" : ""} available
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-4">
          {updates.length > 1 && (
            <ScrollArea className="h-[400px] w-48 rounded-md border p-2">
              <div className="space-y-2">
                {updates.map((update) => (
                  <button
                    type="button"
                    key={update.id}
                    onClick={() => setSelectedPluginId(update.id)}
                    className={`w-full rounded-md p-2 text-left text-sm transition-colors ${
                      selectedUpdate.id === update.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                  >
                    {update.name}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}

          <div className="flex-1 space-y-4">
            <div>
              <h3 className="font-semibold text-lg">{selectedUpdate.name}</h3>
              <div className="mt-2 flex items-center gap-2">
                <Badge color="gray">v{selectedUpdate.currentVersion}</Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <Badge color="blue">v{selectedUpdate.latestVersion}</Badge>
              </div>
            </div>

            {selectedUpdate.permissionChanges && (
              <div className="space-y-3">
                {selectedUpdate.permissionChanges.added.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-amber-600" />
                      <h4 className="font-semibold text-sm text-amber-800 dark:text-amber-200">
                        New Permissions Required
                      </h4>
                    </div>
                    <ul className="space-y-1 text-sm text-amber-700 dark:text-amber-300">
                      {selectedUpdate.permissionChanges.added.map((cap) => (
                        <li key={cap.name} className="flex gap-2">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                          <span>
                            <strong>{cap.name}</strong>: {cap.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {selectedUpdate.permissionChanges.removed.length > 0 && (
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950">
                    <div className="mb-2 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <h4 className="font-semibold text-sm text-green-800 dark:text-green-200">
                        Permissions Removed
                      </h4>
                    </div>
                    <ul className="space-y-1 text-sm text-green-700 dark:text-green-300">
                      {selectedUpdate.permissionChanges.removed.map((cap) => (
                        <li key={cap.name} className="flex gap-2">
                          <span className="text-muted-foreground">•</span>
                          <span>{cap.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {selectedUpdate.changelog && (
              <ScrollArea className="h-[280px] rounded-md border p-4">
                <div className="space-y-4">
                  {selectedUpdate.changelog.new &&
                    selectedUpdate.changelog.new.length > 0 && (
                      <div>
                        <h4 className="mb-2 font-semibold text-sm text-emerald-600">
                          New
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {selectedUpdate.changelog.new.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {selectedUpdate.changelog.improved &&
                    selectedUpdate.changelog.improved.length > 0 && (
                      <div>
                        <h4 className="mb-2 font-semibold text-sm text-blue-600">
                          Improved
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {selectedUpdate.changelog.improved.map(
                            (item, idx) => (
                              <li key={idx} className="flex gap-2">
                                <span className="text-muted-foreground">•</span>
                                <span>{item}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}

                  {selectedUpdate.changelog.fixed &&
                    selectedUpdate.changelog.fixed.length > 0 && (
                      <div>
                        <h4 className="mb-2 font-semibold text-sm text-amber-600">
                          Fixed
                        </h4>
                        <ul className="space-y-1 text-sm">
                          {selectedUpdate.changelog.fixed.map((item, idx) => (
                            <li key={idx} className="flex gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {!selectedUpdate.changelog.new &&
                    !selectedUpdate.changelog.improved &&
                    !selectedUpdate.changelog.fixed && (
                      <p className="text-sm text-muted-foreground">
                        No changelog available for this update.
                      </p>
                    )}
                </div>
              </ScrollArea>
            )}

            {hasNewPermissions && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950">
                <Checkbox
                  id="consent-checkbox"
                  checked={consentGiven}
                  onCheckedChange={(checked) =>
                    setConsentGiven(checked === true)
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor="consent-checkbox"
                  className="cursor-pointer text-sm text-amber-800 dark:text-amber-200"
                >
                  I understand this update requests new permissions and I
                  consent to grant them.
                </label>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isUpdating}
              >
                Cancel
              </Button>
              <Button
                onClick={() => handleUpdate(selectedUpdate.id)}
                disabled={isUpdating || (hasNewPermissions && !consentGiven)}
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Now"
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
