"use client";

import useSWR from "swr";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Share2, Users, Trophy, Clock } from "lucide-react";
import { toastError, toastSuccess } from "@/components/Toast";
import type { GetReferralCodeResponse } from "@/app/api/referrals/code/route";
import type { GetReferralStatsResponse } from "@/app/api/referrals/stats/route";
import type { ReferralStatus } from "@prisma/client";

export function ReferralDashboard() {
  const { data: referralCodeData, isLoading: loadingCode } = useSWR<GetReferralCodeResponse>(
    "/api/referrals/code"
  );
  
  const { data: statsData, isLoading: loadingStats } = useSWR<GetReferralStatsResponse>(
    "/api/referrals/stats"
  );

  const loading = loadingCode || loadingStats;

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
    if (!referralCodeData) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Inbox Zero with my referral",
          text: `Use my referral code ${referralCodeData.code} to get started with Inbox Zero!`,
          url: referralCodeData.link,
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
      copyToClipboard(referralCodeData.link, "link");
    }
  };

  if (loading) {
    return <ReferralDashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">
          Refer Friends, Get Rewards
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Share Inbox Zero with friends and get a free month for each friend who completes their trial
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
          {referralCodeData ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
                <span className="text-2xl font-mono font-bold text-gray-900">
                  {referralCodeData.code}
                </span>
                <Button
                  onClick={() => copyToClipboard(referralCodeData.code, "code")}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Code
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => copyToClipboard(referralCodeData.link, "link")}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </Button>
                <Button
                  onClick={shareReferralLink}
                  variant="default"
                  className="flex-1"
                >
                  <Share2 className="h-4 w-4 mr-2" />
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
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Referrals
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.stats.totalReferrals}</div>
              <p className="text-xs text-muted-foreground">
                Friends you've referred
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Active Trials
              </CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{statsData.stats.activeTrials}</div>
              <p className="text-xs text-muted-foreground">
                Friends in trial period
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
              <div className="text-2xl font-bold">{statsData.stats.totalRewards}</div>
              <p className="text-xs text-muted-foreground">
                Free months earned
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Referrals List */}
      {statsData && statsData.referrals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Referrals</CardTitle>
            <CardDescription>
              Track the status of your referred friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {statsData.referrals.map((referral) => (
                <div
                  key={referral.id}
                  className="flex items-center justify-between border-b pb-4 last:border-0"
                >
                  <div className="space-y-1">
                    <p className="font-medium">
                      {referral.referredUser.name || referral.referredUser.email}
                    </p>
                    <p className="text-sm text-gray-500">
                      Joined {new Date(referral.referredUser.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={getReferralStatusVariant(referral.status as ReferralStatus)}>
                    {getReferralStatusLabel(referral.status as ReferralStatus)}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReferralDashboardSkeleton() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <Skeleton className="h-10 w-96 mx-auto" />
        <Skeleton className="h-6 w-[600px] mx-auto mt-4" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
          <div className="flex gap-2 mt-4">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 flex-1" />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="h-3 w-32 mt-2" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function getReferralStatusVariant(status: ReferralStatus): "secondary" | "default" | "success" | "destructive" {
  switch (status) {
    case "PENDING":
      return "secondary";
    case "TRIAL_STARTED":
      return "default";
    case "REWARDED":
      return "success";
    case "EXPIRED":
      return "destructive";
    default:
      return "secondary";
  }
}

function getReferralStatusLabel(status: ReferralStatus) {
  switch (status) {
    case "PENDING":
      return "Pending";
    case "TRIAL_STARTED":
      return "Trial Active";
    case "REWARDED":
      return "Rewarded";
    case "EXPIRED":
      return "Expired";
    default:
      return status;
  }
}