import { MoreDropdown } from "@/app/(app)/bulk-unsubscribe/common";
import { useUnsubscribe } from "@/app/(app)/bulk-unsubscribe/hooks";
import { Row } from "@/app/(app)/bulk-unsubscribe/types";
import { getDateRangeParams } from "@/app/(app)/stats/params";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import type {
  SenderEmailsQuery,
  SenderEmailsResponse,
} from "@/app/api/user/stats/sender-emails/route";
import { AlertBasic } from "@/components/Alert";
import { LoadingContent } from "@/components/LoadingContent";
import { usePremium } from "@/components/PremiumAlert";
import { Tooltip } from "@/components/Tooltip";
import { SectionHeader } from "@/components/Typography";
import { EmailList } from "@/components/email-list/EmailList";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLabels } from "@/hooks/useLabels";
import { onAutoArchive } from "@/utils/actions/client";
import { getGmailFilterSettingsUrl } from "@/utils/url";
import type { ZodPeriod } from "@inboxzero/tinybird";
import { BarChart } from "@tremor/react";
import { ExternalLinkIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePostHog } from "posthog-js/react";
import type { DateRange } from "react-day-picker";
import useSWR from "swr";

export function NewsletterModal(props: {
  newsletter: Pick<Row, "name" | "lastUnsubscribeLink" | "autoArchived">;
  onClose: (isOpen: boolean) => void;
  refreshInterval?: number;
  mutate?: () => Promise<any>;
}) {
  const { newsletter, refreshInterval, onClose } = props;
  const mutate = props.mutate || (() => Promise.resolve()); // Set a default value for mutate if it's not provided

  const session = useSession();
  const email = session.data?.user.email;

  const { userLabels } = useLabels();

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();

  const posthog = usePostHog();

  const { unsubscribeLoading, onUnsubscribe } = useUnsubscribe({
    item: newsletter,
    hasUnsubscribeAccess,
    mutate,
    posthog,
    refetchPremium,
  });

  return (
    <Dialog open={!!newsletter} onOpenChange={onClose}>
      <DialogContent className="max-h-screen overflow-x-scroll overflow-y-scroll lg:min-w-[880px] xl:min-w-[1280px]">
        {newsletter && (
          <>
            <DialogHeader>
              <DialogTitle>Stats for {newsletter.name}</DialogTitle>
            </DialogHeader>

            <div className="flex space-x-2">
              <Button size="sm" variant="outline" disabled={unsubscribeLoading}>
                <a
                  href={newsletter.lastUnsubscribeLink || undefined}
                  target="_blank"
                  rel="noreferrer"
                  onClick={onUnsubscribe}
                >
                  {unsubscribeLoading ? (
                    <div className="flex cursor-not-allowed items-center opacity-50">
                      <Button loading={true} />
                      <span>Unsubscribing...</span>
                    </div>
                  ) : (
                    <span>Unsubscribe</span>
                  )}
                </a>
              </Button>
              <Tooltip content="Auto archive emails using Gmail filters">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAutoArchive(newsletter.name)}
                >
                  Auto archive
                </Button>
              </Tooltip>
              {newsletter.autoArchived && (
                <Button asChild size="sm" variant="outline">
                  <Link href={getGmailFilterSettingsUrl(email)} target="_blank">
                    <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    View Auto Archive Filter
                  </Link>
                </Button>
              )}
              <MoreDropdown
                item={newsletter}
                userEmail={email || ""}
                userGmailLabels={userLabels}
                posthog={posthog}
              />
            </div>

            <div>
              <EmailsChart
                fromEmail={newsletter.name}
                period="week"
                refreshInterval={refreshInterval}
              />
            </div>
            <div className="lg:max-w-[820px] xl:max-w-[1220px]">
              <Emails
                fromEmail={newsletter.name}
                refreshInterval={refreshInterval}
              />
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EmailsChart(props: {
  fromEmail: string;
  dateRange?: DateRange | undefined;
  period: ZodPeriod;
  refreshInterval?: number;
}) {
  const params: SenderEmailsQuery = {
    ...props,
    ...getDateRangeParams(props.dateRange),
  };
  const { data, isLoading, error } = useSWR<
    SenderEmailsResponse,
    { error: string }
  >(`/api/user/stats/sender-emails/?${new URLSearchParams(params as any)}`, {
    refreshInterval: props.refreshInterval,
  });

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <BarChart
          className="h-72"
          data={data.result}
          index="startOfPeriod"
          categories={["Emails"]}
          colors={["lime"]}
        />
      )}
    </LoadingContent>
  );
}

function Emails(props: { fromEmail: string; refreshInterval?: number }) {
  return (
    <>
      <SectionHeader>Emails</SectionHeader>
      <Tabs defaultValue="unarchived" className="mt-2" searchParam="modal-tab">
        <TabsList>
          <TabsTrigger value="unarchived">Unarchived</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>

        <div className="mt-2">
          <TabsContent value="unarchived">
            <UnarchivedEmails fromEmail={props.fromEmail} />
          </TabsContent>
          <TabsContent value="all">
            <AllEmails fromEmail={props.fromEmail} />
          </TabsContent>
        </div>
      </Tabs>
    </>
  );
}

function UnarchivedEmails({
  fromEmail,
  refreshInterval,
}: {
  fromEmail: string;
  refreshInterval?: number;
}) {
  const url = `/api/google/threads?fromEmail=${encodeURIComponent(fromEmail)}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval,
  });

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <EmailList
          threads={data.threads}
          emptyMessage={
            <AlertBasic
              title="No emails"
              description={`There are no unarchived emails. Switch to the "All" to view all emails from this sender.`}
            />
          }
          hideActionBarWhenEmpty
          refetch={() => mutate()}
        />
      )}
    </LoadingContent>
  );
}

function AllEmails({
  fromEmail,
  refreshInterval,
}: {
  fromEmail: string;
  refreshInterval?: number;
}) {
  const url = `/api/google/threads?fromEmail=${encodeURIComponent(
    fromEmail,
  )}&type=all`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval,
  });

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <EmailList
          threads={data.threads}
          emptyMessage={
            <AlertBasic
              title="No emails"
              description={`There are no unarchived emails. Switch to the "All" to view all emails from this sender.`}
            />
          }
          hideActionBarWhenEmpty
          refetch={() => mutate()}
        />
      )}
    </LoadingContent>
  );
}
