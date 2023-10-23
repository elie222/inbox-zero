"use client";

import { DetailedStats } from "@/app/(app)/stats/DetailedStats";
import { LoadStatsButton } from "@/app/(app)/stats/LoadStatsButton";
import { LargestEmails } from "@/app/(app)/stats/LargestEmails";
import { StatsChart } from "@/app/(app)/stats/StatsChart";
import { EmailAnalytics } from "@/app/(app)/stats/EmailAnalytics";
import { CombinedStatsChart } from "@/app/(app)/stats/CombinedStatsChart";
import { StatsSummary } from "@/app/(app)/stats/StatsSummary";
import { NewsletterStats } from "@/app/(app)/stats/NewsletterStats";

export default function StatsPage() {
  return (
    <div className="pb-20">
      <div className="flex justify-end border-b p-2 shadow">
        <LoadStatsButton />
      </div>

      <StatsSummary />

      <div className="px-4">
        <EmailAnalytics />
      </div>

      <div className="mx-4 mt-4">
        <DetailedStats />
      </div>

      <div className="mt-4">
        <NewsletterStats />
      </div>

      <div className="mt-4 grid gap-4 px-4 md:grid-cols-3">
        <div>
          <StatsChart type="inbox" title="Inbox Emails" color="blue" />
        </div>
        <div>
          <StatsChart type="archived" title="Archived Emails" color="lime" />
        </div>
        <div>
          <StatsChart type="sent" title="Sent Emails" color="slate" />
        </div>
      </div>

      <div className="mt-4 px-4">
        <CombinedStatsChart title="Combined Chart" />
      </div>

      <div className="mt-4 px-4">
        <LargestEmails />
      </div>
    </div>
  );
}
