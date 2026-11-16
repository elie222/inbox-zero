"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { CardBasic } from "@/components/ui/card";
import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import { BarChart } from "./BarChart";
import type { ChartConfig } from "@/components/ui/chart";
import { COLORS } from "@/utils/colors";
import { BRAND_NAME } from "@/utils/branding";

export function EmailActionsAnalytics() {
  const { t } = useLingui();
  const chartConfig = {
    Archived: { label: t`Archived`, color: COLORS.analytics.green },
    Deleted: { label: t`Deleted`, color: COLORS.analytics.pink },
  } satisfies ChartConfig;
  const { data, isLoading, error } = useOrgSWR<EmailActionStatsResponse>(
    "/api/user/stats/email-actions",
  );

  if (data?.disabled) {
    return (
      <CardBasic>
        <p>
          <Trans>
            How many emails you've archived and deleted with {BRAND_NAME}
          </Trans>
        </p>
        <div className="mt-4 h-72 flex items-center justify-center text-muted-foreground">
          <p>
            <Trans>
              This feature is disabled. Contact your admin to enable it.
            </Trans>
          </p>
        </div>
      </CardBasic>
    );
  }

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-32 w-full rounded" />}
    >
      {data && (
        <CardBasic>
          <p>
            <Trans>
              How many emails you've archived and deleted with {BRAND_NAME}
            </Trans>
          </p>
          <div className="mt-4">
            <BarChart
              data={data.result}
              config={chartConfig}
              dataKeys={["Archived", "Deleted"]}
              xAxisKey="date"
            />
          </div>
        </CardBasic>
      )}
    </LoadingContent>
  );
}
