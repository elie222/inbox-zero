"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import type { NoReplyResponse } from "@/app/api/user/no-reply/route";
import { EmailList } from "@/components/email-list/EmailList";
import { OnboardingModal } from "@/components/OnboardingModal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { TabHeader } from "@/components/TabHeader";

export default function NoReplyPage() {
  const { data, isLoading, error, mutate } = useSWR<
    NoReplyResponse,
    { error: string }
  >("/api/user/no-reply");

  return (
    <div>
      <Tabs defaultValue="to-reply">
        <TabHeader
          actions={
            <OnboardingModal
              title="Getting started with Reply Tracker"
              description={
                <>
                  Learn how to track and manage your email replies efficiently.
                  Never miss following up on important conversations.
                </>
              }
              videoId="1LSt3dyyZtQ"
            />
          }
        >
          <TabsList>
            <TabsTrigger value="to-reply">Need to Reply</TabsTrigger>
            <TabsTrigger value="waiting">Waiting for Reply</TabsTrigger>
          </TabsList>
        </TabHeader>

        <TabsContent value="to-reply" className="content-container mb-10">
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <div>
                <EmailList
                  threads={data as any}
                  hideActionBarWhenEmpty
                  refetch={() => mutate()}
                />
              </div>
            )}
          </LoadingContent>
        </TabsContent>
        <TabsContent value="waiting" className="content-container mb-10">
          Waiting for Reply
        </TabsContent>
      </Tabs>
    </div>
  );
}
