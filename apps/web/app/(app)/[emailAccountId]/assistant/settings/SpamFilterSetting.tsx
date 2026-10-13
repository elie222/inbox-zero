"use client";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getAccountScopedKey } from "@/utils/swr";
import { SettingCard } from "@/components/SettingCard";
import { Toggle } from "@/components/Toggle";
import { LoadingContent } from "@/components/LoadingContent";
import { setSpamFilterAction } from "@/utils/actions/spam-filter";
import { createSettingActionErrorHandler } from "@/utils/actions/error-handling";
import type { GetSpamFilterResponse } from "@/app/api/user/spam-filter/route";

export function SpamFilterSetting() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useSWR<GetSpamFilterResponse>(
    getAccountScopedKey("/api/user/spam-filter", emailAccountId || null),
  );
  const { execute, isExecuting } = useAction(
    setSpamFilterAction.bind(null, emailAccountId ?? ""),
    {
      onSuccess: () => {
        mutate();
      },
      onError: createSettingActionErrorHandler({
        mutate,
        prefix: "Could not update spam filtering",
      }),
    },
  );
  const ready = data?.model?.status === "READY";
  const description = ready
    ? `Checks incoming mail before AI processing. ${data.model!.importedMessages.toLocaleString()} imported messages, ${data.model!.importedWords.toLocaleString()} learned tokens. Move mail into or out of Junk to teach the filter. ${data.filtered.toLocaleString()} filtered; ${data.corrections.toLocaleString()} corrections.`
    : "Import your spam corpus to enable filtering before AI processing. Your learned model can be shared across your connected accounts.";
  return (
    <SettingCard
      title="Learned spam filter"
      description={description}
      right={
        <LoadingContent loading={isLoading} error={error}>
          <Toggle
            name="learned-spam-filter"
            enabled={data?.enabled ?? false}
            disabled={!ready || isExecuting}
            onChange={(enabled) => execute({ enabled })}
          />
        </LoadingContent>
      }
    />
  );
}
