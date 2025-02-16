import { redirect } from "next/navigation";
import Link from "next/link";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CheckCircleIcon,
  ClockIcon,
  MailIcon,
  SettingsIcon,
} from "lucide-react";
import { NeedsReply } from "./NeedsReply";
import { Resolved } from "./Resolved";
import { AwaitingReply } from "./AwaitingReply";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { EnableReplyTracker } from "./EnableReplyTracker";
import { TimeRangeFilter } from "./TimeRangeFilter";
import type { TimeRange } from "./date-filter";
import { isAnalyzingReplyTracker } from "@/utils/redis/reply-tracker-analyzing";
import { Button } from "@/components/ui/button";
import { TabsToolbar } from "@/components/TabsToolbar";
import { env } from "@/env";

export const maxDuration = Math.min(env.MAX_DURATION, 600);

export default async function ReplyTrackerPage({
  searchParams,
}: {
  searchParams: { page?: string; timeRange?: TimeRange; enabled?: boolean };
}) {
  const session = await auth();
  if (!session?.user.email) redirect("/login");

  const userId = session.user.id;
  const userEmail = session.user.email;

  const trackRepliesRule = await prisma.rule.findFirst({
    where: { userId, trackReplies: true },
    select: { trackReplies: true, id: true },
  });

  const isAnalyzing = await isAnalyzingReplyTracker(userId);

  if (!trackRepliesRule?.trackReplies && !searchParams.enabled) {
    return <EnableReplyTracker />;
  }

  const page = Number(searchParams.page || "1");
  const timeRange = searchParams.timeRange || "all";

  return (
    <Tabs defaultValue="needsReply" className="flex h-full flex-col">
      <TabsToolbar>
        <div className="w-full overflow-x-auto">
          <div className="flex items-center justify-between gap-2">
            <TabsList>
              <TabsTrigger
                value="needsReply"
                className="flex items-center gap-2"
              >
                <MailIcon className="h-4 w-4" />
                To Reply
              </TabsTrigger>
              <TabsTrigger
                value="awaitingReply"
                className="flex items-center gap-2"
              >
                <ClockIcon className="h-4 w-4" />
                Waiting
              </TabsTrigger>
              {/* <TabsTrigger
                value="needsAction"
                className="flex items-center gap-2"
              >
                <AlertCircleIcon className="h-4 w-4" />
                Needs Action
              </TabsTrigger> */}

              <TabsTrigger value="resolved" className="flex items-center gap-2">
                <CheckCircleIcon className="size-4" />
                Done
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link
                  href={`/automation/rule/${trackRepliesRule?.id}`}
                  target="_blank"
                >
                  <SettingsIcon className="size-4" />
                </Link>
              </Button>
              <TimeRangeFilter />
            </div>
          </div>
        </div>
      </TabsToolbar>

      <TabsContent value="needsReply" className="mt-0 flex-1">
        <NeedsReply
          userId={userId}
          userEmail={userEmail}
          page={page}
          timeRange={timeRange}
          isAnalyzing={isAnalyzing}
        />
      </TabsContent>

      <TabsContent value="awaitingReply" className="mt-0 flex-1">
        <AwaitingReply
          userId={userId}
          userEmail={userEmail}
          page={page}
          timeRange={timeRange}
          isAnalyzing={isAnalyzing}
        />
      </TabsContent>

      {/* <TabsContent value="needsAction" className="mt-0 flex-1">
        <NeedsAction userId={userId} userEmail={userEmail} page={page} />
      </TabsContent> */}

      <TabsContent value="resolved" className="mt-0 flex-1">
        <Resolved
          userId={userId}
          userEmail={userEmail}
          page={page}
          timeRange={timeRange}
        />
      </TabsContent>
    </Tabs>
  );
}
