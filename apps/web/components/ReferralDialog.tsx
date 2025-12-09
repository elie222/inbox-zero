"use client";

import useSWR from "swr";
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

export function ReferralDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton sidebarName="left-sidebar">
          <GiftIcon />
          <span className="font-semibold">Refer friend</span>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <Referrals />
      </DialogContent>
    </Dialog>
  );
}

export function Referrals() {
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

  const link = generateReferralLink(codeData?.code || "");

  const copyToClipboard = async (text: string, type: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      toastSuccess({ description: `Referral ${type} copied to clipboard!` });
    } catch {
      toastError({
        title: `Failed to copy ${type}`,
        description: "Please try again",
      });
    }
  };

  const shareReferralLink = async () => {
    if (!codeData?.code) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Inbox Zero with my referral link",
          text: "Use my referral link to get started with Inbox Zero!",
          url: link,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          toastError({
            title: "Failed to share",
            description: "Please try again",
          });
        }
      }
    } else {
      copyToClipboard(link, "link");
    }
  };

  if (loading) {
    return <ReferralDashboardSkeleton />;
  }

  if (errorCode || errorStats) {
    return <ErrorDisplay error={{ error: "Error loading referral data" }} />;
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <div className="text-center">
        <PageHeading>Refer Friends, Get Rewards</PageHeading>
        <PageSubHeading className="mt-2">
          Share Inbox Zero with friends and get a free month for each friend who
          completes their trial
        </PageSubHeading>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
          <CardDescription>
            Share this code with friends to earn rewards
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
                  Copy Link
                </Button>
                <Button
                  onClick={shareReferralLink}
                  variant="default"
                  className="flex-1"
                >
                  <Share2 className="mr-2 h-4 w-4" />
                  Share
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">Unable to load referral code</p>
          )}
        </CardContent>
      </Card>

      {/* Stats Cards */}
      {statsData && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Referrals
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsData.stats.totalReferrals}
              </div>
              <p className="text-xs text-muted-foreground">
                Friends you've referred
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Rewards Earned
              </CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {statsData.stats.totalRewards}
              </div>
              <p className="text-xs text-muted-foreground">
                Free months earned
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
