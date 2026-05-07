"use client";

import { useState, useCallback } from "react";
import { CrownIcon } from "lucide-react";
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
import { Tooltip } from "@/components/Tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { DigestSettingsForm } from "@/app/(app)/[emailAccountId]/settings/DigestSettingsForm";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAction } from "next-safe-action/hooks";
import { toggleDigestAction } from "@/utils/actions/settings";
import { toastError } from "@/components/Toast";
import { createCanonicalTimeOfDay } from "@/utils/schedule";
import { usePremium } from "@/hooks/usePremium";
import { hasTierAccess } from "@/utils/premium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";

export function DigestSetting() {
  const [open, setOpen] = useState(false);
  const { data, isLoading, mutate } = useEmailAccountFull();
  const { tier, isLoading: isLoadingPremium } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  const enabled = data?.digestSchedule != null;
  const hasDigestAccess = hasTierAccess({
    tier,
    minimumTier: "PLUS_MONTHLY",
  });

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
      executeToggle({
        enabled: enable,
        timeOfDay: enable ? createCanonicalTimeOfDay(9, 0) : undefined,
      });
    },
    [data, mutate, executeToggle],
  );

  return (
    <>
      <SettingCard
        title="Digest"
        description="Get a daily summary of your newsletter emails."
        right={
          isLoading || isLoadingPremium ? (
            <Skeleton className="h-5 w-9" />
          ) : (
            <div className="flex items-center gap-2">
              {hasDigestAccess ? (
                enabled && (
                  <Dialog open={open} onOpenChange={setOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">
                        Configure
                      </Button>
                    </DialogTrigger>
                    <DigestSettingsDialogContent
                      onSuccess={() => setOpen(false)}
                    />
                  </Dialog>
                )
              ) : (
                <Tooltip content="Upgrade to the Plus plan to enable daily digest emails.">
                  <Button variant="outline" size="sm" onClick={openModal}>
                    <CrownIcon className="mr-2 h-4 w-4" />
                    Upgrade
                  </Button>
                </Tooltip>
              )}
              <Toggle
                name="digest-enabled"
                enabled={hasDigestAccess && enabled}
                disabled={!hasDigestAccess}
                onChange={handleToggle}
              />
            </div>
          )
        }
      />
      <PremiumModal />
    </>
  );
}

export function DigestSettingsDialogContent({
  onSuccess,
  showChannelsHint = true,
}: {
  onSuccess?: () => void;
  showChannelsHint?: boolean;
}) {
  return (
    <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Digest settings</DialogTitle>
        <DialogDescription>
          Configure when your digest emails are sent and which rules are
          included.
        </DialogDescription>
      </DialogHeader>

      <DigestSettingsForm
        onSuccess={onSuccess}
        showChannelsHint={showChannelsHint}
      />
    </DialogContent>
  );
}
