"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { usePostHog } from "posthog-js/react";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Share2, Users, Trophy, GiftIcon } from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import type { GetReferralStatsResponse } from "@/app/api/referrals/stats/route";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import type { GetReferralCodeResponse } from "@/app/api/referrals/code/route";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { generateReferralLink } from "@/utils/referral/referral-link";
import { PageHeading, PageSubHeading } from "@/components/Typography";

export type ReferralSurface = "account_menu" | "refer_page" | "sidebar";

export function ReferralDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton sidebarName="left-sidebar">
          <GiftIcon />
          <span className="font-semibold">
            <Trans>Refer friend</Trans>
          </span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <Referrals source="sidebar" />
      </DialogContent>
    </Dialog>
  );
}

export function Referrals({ source }: { source: ReferralSurface }) {
  const { t } = useLingui();
  const posthog = usePostHog();
  const {
    data: codeData,
    isLoading: loadingCode,
    error: errorCode,
  } = useSWR<GetReferralCodeResponse>("/api/referrals/code");

  const {
    data: statsData,
    isLoading: loadingStats,
    error: errorStats,
  } = useSWR<GetReferralStatsResponse>("/api/referrals/stats");

  const loading = loadingCode || loadingStats;

  useEffect(() => {
    posthog?.capture("Referral Surface Shown", { source });
  }, [posthog, source]);

  const link = generateReferralLink(codeData?.code || "");

  const copyToClipboard = async (
    text: string,
    type: "code" | "link",
    captureAction = true,
  ) => {
    if (captureAction) {
      posthog?.capture("Clicked Referral Surface", {
        action: `copy_${type}`,
        source,
      });
    }

    try {
      await navigator.clipboard.writeText(text);
      toastSuccess({
        description:
          type === "code"
            ? t`Referral code copied to clipboard!`
            : t`Referral link copied to clipboard!`,
      });
    } catch {
      toastError({
        title:
          type === "code" ? t`Failed to copy code` : t`Failed to copy link`,
        description: t`Please try again`,
      });
    }
  };

  const shareReferralLink = async () => {
    if (!codeData?.code) return;

    posthog?.capture("Clicked Referral Surface", {
      action: "share",
      method:
        typeof navigator.share === "function"
          ? "native_share"
          : "copy_fallback",
      source,
    });

    if (navigator.share) {
      try {
        await navigator.share({
          title: t`Join Inbox Zero with my referral link`,
          text: t`Use my referral link to get started with Inbox Zero!`,
          url: link,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          toastError({
            title: t`Failed to share`,
            description: t`Please try again`,
          });
        }
      }
    } else {
      copyToClipboard(link, "link", false);
    }
  };

  if (loading) {
    return <ReferralDashboardSkeleton />;
  }

  if (errorCode || errorStats) {
    return <ErrorDisplay error={{ error: t`Error loading referral data` }} />;
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="text-center">
        <PageHeading>
          <Trans>Refer Friends, Get Rewards</Trans>
        </PageHeading>
        <PageSubHeading className="mt-2">
          <Trans>
            Share Inbox Zero with friends and get a free month for each friend
            who completes their trial
          </Trans>
        </PageSubHeading>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <Trans>Your referral code</Trans>
          </CardTitle>
          <CardDescription>
            <Trans>Share this code with friends to earn rewards</Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {codeData?.code ? (
            <div className="space-y-4">
              <div className="rounded-lg border bg-gray-50 p-3 sm:p-4">
                <div className="overflow-x-auto">
                  <span className="font-mono text-sm sm:text-base lg:text-lg font-bold text-gray-900 break-all">
                    {link}
                  </span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={() => copyToClipboard(link, "link")}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  <Trans>Copy Link</Trans>
                </Button>
                <Button
                  onClick={shareReferralLink}
                  variant="default"
                  className="flex-1"
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  <Trans>Share</Trans>
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">
              <Trans>Unable to load referral code</Trans>
            </p>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <Trans>Total referrals</Trans>
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsData.stats.totalReferrals}
              </div>
              <p className="text-xs text-muted-foreground">
                <Trans>Friends you've referred</Trans>
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <Trans>Rewards earned</Trans>
              </CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsData.stats.totalRewards}
              </div>
              <p className="text-xs text-muted-foreground">
                <Trans>Free months earned</Trans>
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function ReferralDashboardSkeleton() {
  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="text-center">
        <Skeleton className="mx-auto h-8 sm:h-10 w-full max-w-sm" />
        <Skeleton className="mx-auto mt-3 sm:mt-4 h-5 sm:h-6 w-full max-w-md" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-4 w-full max-w-xs" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-16 sm:h-20 w-full" />
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
