"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2Icon, AlertTriangleIcon } from "lucide-react";
import { uninstallPluginAction } from "@/utils/actions/plugins";
import { toastSuccess, toastError } from "@/components/Toast";

interface UninstallDialogProps {
  pluginId: string;
  pluginName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function UninstallDialog({
  pluginId,
  pluginName,
  open,
  onOpenChange,
  onSuccess,
}: UninstallDialogProps) {
  const [isUninstalling, setIsUninstalling] = useState(false);

  const handleUninstall = async () => {
    setIsUninstalling(true);
    try {
      const result = await uninstallPluginAction({ pluginId });

      if (result?.serverError) {
        toastError({
          title: "Failed to uninstall",
          description: result.serverError,
        });
      } else {
        toastSuccess({ description: `${pluginName} uninstalled successfully` });
        onOpenChange(false);
        onSuccess();
      }
    } catch {
      toastError({
        title: "Failed to uninstall",
        description: "An unexpected error occurred",
      });
    } finally {
      setIsUninstalling(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          Icon={Trash2Icon}
          aria-label="Uninstall plugin"
        >
          Uninstall
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangleIcon className="h-5 w-5 text-destructive" />
            Uninstall Plugin
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to uninstall <strong>{pluginName}</strong>?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950">
            <p className="text-sm text-muted-foreground">
              This will permanently remove the plugin and all its settings. This
              action cannot be undone.
            </p>
          </div>

          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="font-medium">The following will be removed:</p>
            <ul className="list-inside list-disc space-y-1 pl-2">
              <li>Plugin configuration and settings</li>
              <li>All saved plugin data</li>
              <li>Scheduled plugin tasks</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isUninstalling}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleUninstall}
            loading={isUninstalling}
            Icon={Trash2Icon}
          >
            Uninstall
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
