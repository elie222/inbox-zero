import useSWR from "swr";
import { BarChart } from "@tremor/react";
import type { DateRange } from "react-day-picker";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { usePostHog } from "posthog-js/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import type {
  SenderEmailsQuery,
  SenderEmailsResponse,
} from "@/app/api/user/stats/sender-emails/route";
import type { ZodPeriod } from "@inboxzero/tinybird";
import { LoadingContent } from "@/components/LoadingContent";
import { SectionHeader } from "@/components/Typography";
import { EmailList } from "@/components/email-list/EmailList";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getGmailFilterSettingsUrl } from "@/utils/url";
import { Tooltip } from "@/components/Tooltip";
import { AlertBasic } from "@/components/Alert";
import { MoreDropdown } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import { useLabels } from "@/hooks/useLabels";
import type { Row } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { useThreads } from "@/hooks/useThreads";
import { useAccount } from "@/providers/EmailAccountProvider";
import { onAutoArchive } from "@/utils/actions/client";

export function NewsletterModal(props: {
  newsletter?: Pick<Row, "name" | "unsubscribeLink" | "autoArchived">;
  onClose: (isOpen: boolean) => void;
  refreshInterval?: number;
  mutate: () => Promise<any>;
}) {
  const { newsletter, refreshInterval, onClose, mutate } = props;

  const { emailAccountId, userEmail } = useAccount();

  const { userLabels } = useLabels();

  const posthog = usePostHog();

  return (
    <Dialog open={!!newsletter} onOpenChange={onClose}>
      <DialogContent className="overflow-scroll lg:min-w-[880px] xl:min-w-[1280px]">
        {newsletter && (
          <>
            <DialogHeader>
              <DialogTitle>Stats for {newsletter.name}</DialogTitle>
            </DialogHeader>

            <div className="flex space-x-2">
              <Button size="sm" variant="outline">
                <a
                  href={newsletter.unsubscribeLink || undefined}
                  target="_blank"
                  rel="noreferrer"
                >
                  Unsubscribe
                </a>
              </Button>
              <Tooltip content="Auto archive emails using Gmail filters">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onAutoArchive({
                      emailAccountId,
                      from: newsletter.name,
                    });
                  }}
                >
                  Skip Inbox
                </Button>
              </Tooltip>
              {newsletter.autoArchived && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    href={getGmailFilterSettingsUrl(userEmail)}
                    target="_blank"
                  >
                    <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    View Skip Inbox Filter
                  </Link>
                </Button>
              )}
              <MoreDropdown
                item={newsletter}
                userEmail={userEmail}
                emailAccountId={emailAccountId}
                labels={userLabels}
                posthog={posthog}
                mutate={mutate}
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

function useSenderEmails(props: {
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

  return { data, isLoading, error };
}

function EmailsChart(props: {
  fromEmail: string;
  dateRange?: DateRange | undefined;
  period: ZodPeriod;
  refreshInterval?: number;
}) {
  const { data, isLoading, error } = useSenderEmails(props);

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
  const { data, isLoading, error, mutate } = useThreads({
    fromEmail,
    refreshInterval,
  });

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <EmailList
          threads={data.threads}
          emptyMessage={
            <AlertBasic
              title="No unarchived emails"
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
  const { data, isLoading, error, mutate } = useThreads({
    fromEmail,
    type: "all",
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
              description="There are no emails from this sender."
            />
          }
          hideActionBarWhenEmpty
          refetch={() => mutate()}
        />
      )}
    </LoadingContent>
  );
}
