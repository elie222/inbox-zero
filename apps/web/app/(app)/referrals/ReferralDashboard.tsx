"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Copy, Share2, Users, Trophy, Clock, CheckCircle } from "lucide-react";
import { toast } from "@/utils/toast";

interface ReferralCode {
  code: string;
  link: string;
  isActive: boolean;
}

interface ReferralStats {
  referralCode: { code: string } | null;
  stats: {
    totalReferrals: number;
    pendingReferrals: number;
    activeTrials: number;
    completedReferrals: number;
    totalRewards: number;
    activeRewards: number;
  };
  referrals: Array<{
    id: string;
    status: string;
    createdAt: string;
    referredUser: {
      email: string;
      name: string | null;
      createdAt: string;
    };
    reward: {
      id: string;
      rewardType: string;
      rewardValue: number;
      appliedAt: string;
      expiresAt: string | null;
    } | null;
  }>;
}

export function ReferralDashboard() {
  const [referralCode, setReferralCode] = useState<ReferralCode | null>(null);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    fetchReferralData();
  }, []);

  const fetchReferralData = async () => {
    try {
      const [codeResponse, statsResponse] = await Promise.all([
        fetch("/api/referrals/code"),
        fetch("/api/referrals/stats"),
      ]);

      if (codeResponse.ok) {
        const codeData = await codeResponse.json();
        setReferralCode(codeData);
      }

      if (statsResponse.ok) {
        const statsData = await statsResponse.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error("Error fetching referral data:", error);
      toast.error("Failed to load referral data");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, type: "code" | "link") => {
    setCopying(true);
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Referral ${type} copied to clipboard!`);
    } catch (error) {
      toast.error(`Failed to copy ${type}`);
    } finally {
      setCopying(false);
    }
  };

  const shareReferralLink = async () => {
    if (!referralCode) return;

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Join Inbox Zero with my referral",
          text: `Use my referral code ${referralCode.code} to get started with Inbox Zero!`,
          url: referralCode.link,
        });
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          toast.error("Failed to share");
        }
      }
    } else {
      copyToClipboard(referralCode.link, "link");
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
          {referralCode ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border bg-gray-50 p-4">
                <span className="text-2xl font-mono font-bold text-gray-900">
                  {referralCode.code}
                </span>
                <Button
                  onClick={() => copyToClipboard(referralCode.code, "code")}
                  disabled={copying}
                  variant="outline"
                  size="sm"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Code
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={() => copyToClipboard(referralCode.link, "link")}
                  disabled={copying}
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
      {stats && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Referrals
              </CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.stats.totalReferrals}</div>
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
              <div className="text-2xl font-bold">{stats.stats.activeTrials}</div>
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
              <div className="text-2xl font-bold">{stats.stats.totalRewards}</div>
              <p className="text-xs text-muted-foreground">
                Free months earned
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Referrals List */}
      {stats && stats.referrals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Referrals</CardTitle>
            <CardDescription>
              Track the status of your referred friends
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.referrals.map((referral) => (
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
                  <Badge variant={getReferralStatusVariant(referral.status)}>
                    {getReferralStatusLabel(referral.status)}
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

function getReferralStatusVariant(status: string) {
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

function getReferralStatusLabel(status: string) {
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