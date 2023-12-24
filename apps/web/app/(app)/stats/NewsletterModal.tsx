import { useState } from "react";
import useSWR from "swr";
import { BarChart } from "@tremor/react";
import { DateRange } from "react-day-picker";
import Link from "next/link";
import { ExternalLinkIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDateRangeParams } from "@/app/(app)/stats/params";
import {
  SenderEmailsQuery,
  SenderEmailsResponse,
} from "@/app/api/user/stats/sender-emails/route";
import { ZodPeriod } from "@inboxzero/tinybird";
import { LoadingContent } from "@/components/LoadingContent";
import { SectionHeader } from "@/components/Typography";
import { EmailList } from "@/components/email-list/EmailList";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { getGmailFilterSettingsUrl, getGmailSearchUrl } from "@/utils/url";
import { Tooltip } from "@/components/Tooltip";
import { AlertBasic } from "@/components/Alert";
import { onAutoArchive } from "@/utils/actions-client";
import { Row } from "@/app/(app)/newsletters/common";

export function NewsletterModal(props: {
  newsletter?: Pick<Row, "name" | "lastUnsubscribeLink" | "autoArchived">;
  onClose: (isOpen: boolean) => void;
  refreshInterval?: number;
}) {
  const { newsletter, refreshInterval, onClose } = props;

  const session = useSession();
  const email = session.data?.user.email;

  return (
    <Dialog open={!!newsletter} onOpenChange={onClose}>
      <DialogContent className="max-h-screen overflow-x-scroll overflow-y-scroll lg:min-w-[880px] xl:min-w-[1280px]">
        {newsletter && (
          <>
            <DialogHeader>
              <DialogTitle>Detailed Stats</DialogTitle>
              <DialogDescription>{newsletter.name}</DialogDescription>
            </DialogHeader>

            <div className="flex space-x-2">
              <Button size="sm" variant="secondary">
                <a
                  href={newsletter.lastUnsubscribeLink || undefined}
                  target="_blank"
                >
                  Unsubscribe
                </a>
              </Button>
              <Tooltip content="Auto archive emails using Gmail filters">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onAutoArchive(newsletter.name)}
                >
                  Auto archive
                </Button>
              </Tooltip>
              <Button asChild size="sm" variant="secondary">
                <Link
                  href={getGmailSearchUrl(newsletter.name, email)}
                  target="_blank"
                >
                  <ExternalLinkIcon className="mr-2 h-4 w-4" />
                  View emails in Gmail
                </Link>
              </Button>
              {newsletter.autoArchived && (
                <Button asChild size="sm" variant="secondary">
                  <Link href={getGmailFilterSettingsUrl(email)} target="_blank">
                    <ExternalLinkIcon className="mr-2 h-4 w-4" />
                    View Auto Archive Filter
                  </Link>
                </Button>
              )}
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
          className="mt-4 h-72"
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
  const [tab, setTab] = useState<"unarchived" | "all">("unarchived");
  const url = `/api/google/threads?&fromEmail=${encodeURIComponent(
    props.fromEmail,
  )}${tab === "all" ? "&includeAll=true" : ""}`;
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(url, {
    refreshInterval: props.refreshInterval,
  });

  return (
    <>
      <SectionHeader>Emails</SectionHeader>
      <Tabs
        defaultValue="unarchived"
        className="mt-2"
        onValueChange={setTab as any}
      >
        <TabsList>
          <TabsTrigger value="unarchived">Unarchived</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="mt-2">
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
              refetch={mutate}
            />
          )}
        </LoadingContent>
      </div>
    </>
  );
}
