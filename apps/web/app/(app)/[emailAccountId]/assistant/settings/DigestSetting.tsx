"use client";

import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { SettingCard } from "@/components/SettingCard";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Toggle } from "@/components/Toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { DigestSettingsForm } from "@/app/(app)/[emailAccountId]/settings/DigestSettingsForm";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { toggleDigestAction } from "@/utils/actions/settings";
import { toastError } from "@/components/Toast";

export function DigestSetting() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, mutate } = useEmailAccountFull();

  const enabled = data?.digestSchedule != null;

  const { execute: executeToggle } = useAction(
    toggleDigestAction.bind(null, data?.id ?? ""),
    {
      onError: (error) => {
        mutate();
        toastError({
          description: error.error?.serverError ?? "Failed to update settings",
        });
      },
    },
  );

  const handleToggle = useCallback(
    (enable: boolean) => {
      if (!data) return;

      const optimisticData = {
        ...data,
        digestSchedule: enable ? {} : null,
      };
      mutate(optimisticData as typeof data, false);
      executeToggle({ enabled: enable });
    },
    [data, mutate, executeToggle],
  );

  return (
    <SettingCard
      title="Digest"
      description="Get a daily summary of your newsletter emails."
      right={
        isLoading ? (
          <Skeleton className="h-5 w-9" />
        ) : (
          <div className="flex items-center gap-2">
            {enabled && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm">
                    Configure
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Digest settings</DialogTitle>
                    <DialogDescription>
                      Configure when your digest emails are sent and which rules
                      are included.
                    </DialogDescription>
                  </DialogHeader>

                  <DigestSettingsForm onSuccess={() => setOpen(false)} />
                </DialogContent>
              </Dialog>
            )}
            <Toggle
              name="digest-enabled"
              enabled={enabled}
              onChange={handleToggle}
            />
          </div>
        )
      }
    />
  );
}
