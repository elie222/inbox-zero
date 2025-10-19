"use client";

import useSWR from "swr";
import { MailOpen, Calendar } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { OnboardingStatsResponse } from "@/app/api/user/onboarding-stats/route";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | undefined;
  isLoading: boolean;
}

function StatCard({ icon, label, value, isLoading }: StatCardProps) {
  return (
    <Card className="text-center">
      <CardContent className="p-6">
        <div className="flex flex-col items-center space-y-3">
          <div className="text-muted-foreground">{icon}</div>
          {isLoading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <div className="text-2xl font-bold">
              {value?.toLocaleString() || 0}
            </div>
          )}
          <div className="text-sm text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailStatsCard() {
  const { data, isLoading, error } = useSWR<OnboardingStatsResponse>(
    "/api/user/onboarding-stats",
  );

  if (error) {
    return (
      <div className="text-center text-sm text-muted-foreground">
        Unable to load email statistics
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <StatCard
        icon={<MailOpen className="h-6 w-6" />}
        label="Unread Inbox"
        value={data?.unreadCount}
        isLoading={isLoading}
      />
      <StatCard
        icon={<Calendar className="h-6 w-6" />}
        label="Yesterday's Emails"
        value={data?.yesterdayCount}
        isLoading={isLoading}
      />
    </div>
  );
}
