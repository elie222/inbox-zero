"use client";

import { useCallback } from "react";
import { useAction } from "next-safe-action/hooks";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import { updateHiddenAiDraftLinksAction } from "@/utils/actions/email-account";

export function HiddenAiDraftLinksSetting() {
  const { data, isLoading, error, mutate } = useEmailAccountFull();
  const { emailAccountId } = useAccount();

  const { execute } = useAction(
    updateHiddenAiDraftLinksAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Failed to update hidden AI draft links setting",
      }),
    },
  );

  const enabled = data?.allowHiddenAiDraftLinks ?? false;

  const handleToggle = useCallback(
    (nextEnabled: boolean) => {
      if (!data) return;

      mutate(
        {
          ...data,
          allowHiddenAiDraftLinks: nextEnabled,
        },
        false,
      );

      execute({ enabled: nextEnabled });
    },
    [data, execute, mutate],
  );

  return (
    <SettingCard
      title="Allow hidden links in AI drafts"
      description="Let AI-generated drafts use custom anchor text like 'click here'. This is more convenient, but it hides the full destination and any data in the link."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="hidden-ai-draft-links"
            enabled={enabled}
            onChange={handleToggle}
            disabled={isLoading}
          />
        </LoadingContent>
      }
    />
  );
}
