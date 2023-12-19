"use client";

import { BotIcon, CoinsIcon, CpuIcon } from "lucide-react";
import { formatStat } from "@/utils/stats";
import { StatsCards } from "@/components/StatsCards";
import { usePremium } from "@/components/PremiumAlert";
import { LoadingContent } from "@/components/LoadingContent";
import { env } from "@/env.mjs";
import { isPremium } from "@/utils/premium";

export function Usage(props: {
  usage?: {
    openaiCalls: number;
    openaiTokensUsed: number;
  } | null;
}) {
  const { data, isLoading, error } = usePremium();

  return (
    <LoadingContent loading={isLoading} error={error}>
      <StatsCards
        stats={[
          {
            name: "Unsubscribe Credits",
            value: isPremium(data?.lemonSqueezyRenewsAt || null)
              ? "Unlimited"
              : formatStat(
                  data?.unsubscribeCredits ??
                    env.NEXT_PUBLIC_UNSUBSCRIBE_CREDITS,
                ),
            subvalue: "credits",
            icon: <CoinsIcon className="h-4 w-4" />,
          },
          {
            name: "OpenAI API Calls",
            value: formatStat(props.usage?.openaiCalls),
            subvalue: "calls",
            icon: <BotIcon className="h-4 w-4" />,
          },
          {
            name: "OpenAI Tokens Used",
            value: formatStat(props.usage?.openaiTokensUsed),
            subvalue: "tokens",
            icon: <CpuIcon className="h-4 w-4" />,
          },
        ]}
      />
    </LoadingContent>
  );
}
