"use client";

import { BotIcon, CoinsIcon, CpuIcon } from "lucide-react";
import { useLingui } from "@lingui/react/macro";
import { formatStat } from "@/utils/stats";
import { StatsCards } from "@/components/StatsCards";
import { usePremium } from "@/hooks/usePremium";
import { LoadingContent } from "@/components/LoadingContent";
import { env } from "@/env";
import { isPremiumRecord } from "@/utils/premium";
import type { RedisUsage } from "@/utils/redis/usage";

export function Usage(props: { usage: RedisUsage | null }) {
  const { t } = useLingui();
  const { premium, unsubscribeCreditsRemaining, isLoading, error } =
    usePremium();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <StatsCards
        stats={[
          {
            name: t`Unsubscribe Credits`,
            value: isPremiumRecord(premium)
              ? t`Unlimited`
              : formatStat(
                  unsubscribeCreditsRemaining ??
                    env.NEXT_PUBLIC_FREE_UNSUBSCRIBE_CREDITS,
                ),
            subvalue: t`credits`,
            icon: <CoinsIcon className="h-4 w-4" />,
          },
          {
            name: t`LLM API Calls`,
            value: formatStat(props.usage?.calls),
            subvalue: t`calls`,
            icon: <BotIcon className="h-4 w-4" />,
          },
          {
            name: t`LLM Tokens Used`,
            value: formatStat(props.usage?.tokensUsed),
            subvalue: t`tokens`,
            icon: <CpuIcon className="h-4 w-4" />,
          },
        ]}
      />
    </LoadingContent>
  );
}
