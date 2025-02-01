import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircleIcon,
  CheckCircleIcon,
  ClockIcon,
  MailIcon,
} from "lucide-react";
import { NeedsReply } from "./NeedsReply";
import { Resolved } from "@/app/(app)/reply-tracking/Resolved";
import { AwaitingReply } from "@/app/(app)/reply-tracking/AwaitingReply";
import { NeedsAction } from "@/app/(app)/reply-tracking/NeedsAction";

export default async function ReplyTrackingPage() {
  return (
    <Tabs defaultValue="needsReply" className="w-full">
      <div className="content-container flex shrink-0 flex-col justify-between gap-x-4 space-y-2 border-b border-gray-200 bg-white py-2 shadow-sm md:flex-row md:gap-x-6 md:space-y-0">
        <div className="w-full overflow-x-auto">
          <TabsList className="mb-6">
            <TabsTrigger value="needsReply" className="flex items-center gap-2">
              <MailIcon className="h-4 w-4" />
              Needs Reply
            </TabsTrigger>
            <TabsTrigger
              value="awaitingReply"
              className="flex items-center gap-2"
            >
              <ClockIcon className="h-4 w-4" />
              Awaiting Reply
            </TabsTrigger>
            <TabsTrigger
              value="needsAction"
              className="flex items-center gap-2"
            >
              <AlertCircleIcon className="h-4 w-4" />
              Needs Action
            </TabsTrigger>

            <TabsTrigger value="resolved" className="flex items-center gap-2">
              <CheckCircleIcon className="h-4 w-4" />
              Resolved
            </TabsTrigger>
          </TabsList>
        </div>
      </div>

      <TabsContent value="needsReply">
        <NeedsReply />
      </TabsContent>

      <TabsContent value="awaitingReply">
        <AwaitingReply />
      </TabsContent>

      <TabsContent value="needsAction">
        <NeedsAction />
      </TabsContent>

      <TabsContent value="resolved">
        <Resolved />
      </TabsContent>
    </Tabs>
  );
}
