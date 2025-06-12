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
import { env } from "@/env";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { SidebarMenuButton } from "@/components/ui/sidebar";
import type { GetReferralCodeResponse } from "@/app/api/referrals/code/route";
import { ErrorDisplay } from "@/components/ErrorDisplay";

export function ReferralDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <SidebarMenuButton className="h-9">
          <>
            <GiftIcon />
            <span className="font-semibold">Refer friend</span>
          </>
        </SidebarMenuButton>
      </DialogTrigger>
      <DialogContent className="max-w-4xl">
        <Referrals />
      </DialogContent>
    </Dialog>
  );
}

function Referrals() {
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
    } catch (error) {
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
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Refer Friends, Get Rewards
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Share Inbox Zero with friends and get a free month for each friend who
          completes their trial
        </p>
      </div>

      {/* Referral Code Card */}
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
              <div className="flex flex-col items-center justify-between rounded-lg border bg-gray-50 p-4 sm:flex-row">
                <span className="font-mono text-2xl font-bold text-gray-900">
                  {link}
                </span>
                {/* <Button
                  onClick={() => copyToClipboard(link, "code")}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copy Link
                </Button> */}
              </div>

              <div className="flex gap-2">
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
    <div className="space-y-8">
      <div className="text-center">
        <Skeleton className="mx-auto h-10 w-96" />
        <Skeleton className="mx-auto mt-4 h-6 w-[600px]" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="mt-2 h-4 w-60" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
          <div className="mt-4 flex gap-2">
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

function generateReferralLink(code: string): string {
  return `${env.NEXT_PUBLIC_BASE_URL}/?ref=${encodeURIComponent(code)}`;
}
