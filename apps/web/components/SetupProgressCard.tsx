"use client";

import { ChevronRightIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import { useAccount } from "@/providers/EmailAccountProvider";
import { prefixPath } from "@/utils/path";
import { useSetupProgress } from "@/hooks/useSetupProgress";

export function SetupProgressCard() {
  const { emailAccountId } = useAccount();
  const { data, isLoading } = useSetupProgress();

  if (isLoading || !data || data.isComplete) {
    return null;
  }

  return (
    <div className="px-3 pt-4">
      <Link href={prefixPath(emailAccountId, "/setup")}>
        <Card className="cursor-pointer transition-all shadow-none p-2.5 hover:shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ProgressCircle completed={data.completed} total={data.total} />

              <div>
                <h3 className="text-sm font-semibold">Complete setup</h3>
                <p className="text-xs text-muted-foreground">
                  {data.completed}/{data.total} Completed
                </p>
              </div>
            </div>

            <ChevronRightIcon className="h-4 w-4 text-muted-foreground" />
          </div>
        </Card>
      </Link>
    </div>
  );
}

function ProgressCircle({
  completed,
  total,
}: {
  completed: number;
  total: number;
}) {
  const percentage = (completed / total) * 100;
  const radius = 13;
  const strokeWidth = 4;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative h-8 w-8">
      <svg className="h-8 w-8 -rotate-90 transform" width="32" height="32">
        {/* Background circle */}
        <circle
          stroke="currentColor"
          strokeWidth={strokeWidth}
          fill="none"
          r={normalizedRadius}
          cx={16}
          cy={16}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          fill="none"
          r={normalizedRadius}
          cx={16}
          cy={16}
          className="text-green-500 transition-all duration-300 ease-in-out"
        />
      </svg>
    </div>
  );
}
