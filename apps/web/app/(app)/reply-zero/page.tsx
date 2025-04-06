import { redirect } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircleIcon, ClockIcon, MailIcon } from "lucide-react";
import { NeedsReply } from "./NeedsReply";
import { Resolved } from "./Resolved";
import { AwaitingReply } from "./AwaitingReply";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { TimeRangeFilter } from "./TimeRangeFilter";
import type { TimeRange } from "./date-filter";
import { isAnalyzingReplyTracker } from "@/utils/redis/reply-tracker-analyzing";
import { TabsToolbar } from "@/components/TabsToolbar";
import { GmailProvider } from "@/providers/GmailProvider";
import { cookies } from "next/headers";
import { REPLY_ZERO_ONBOARDING_COOKIE } from "@/utils/cookies";
import { ActionType } from "@prisma/client";

export const maxDuration = 300;

export default async function ReplyTrackerPage(props: {
  searchParams: Promise<{
    page?: string;
    timeRange?: TimeRange;
    enabled?: boolean;
  }>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user.email) redirect("/login");

  const userId = session.user.id;
  const userEmail = session.user.email;

  const cookieStore = await cookies();
  const viewedOnboarding =
    cookieStore.get(REPLY_ZERO_ONBOARDING_COOKIE)?.value === "true";

  if (!viewedOnboarding) redirect("/reply-zero/onboarding");

  const trackerRule = await prisma.rule.findFirst({
    where: { userId, actions: { some: { type: ActionType.TRACK_THREAD } } },
    select: { id: true },
  });

  if (!trackerRule) redirect("/reply-zero/onboarding");

  const isAnalyzing = await isAnalyzingReplyTracker(userId);

  const page = Number(searchParams.page || "1");
  const timeRange = searchParams.timeRange || "all";

  return (
    <GmailProvider>
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

                <TabsTrigger
                  value="resolved"
                  className="flex items-center gap-2"
                >
                  <CheckCircleIcon className="size-4" />
                  Done
                </TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
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
    </GmailProvider>
  );
}
