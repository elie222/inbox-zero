import { useState } from "react";
import useSWR from "swr";
import { BarChart } from "@tremor/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDateRangeParams } from "@/app/(app)/stats/params";
import { DateRange } from "react-day-picker";
import {
  SenderEmailsQuery,
  SenderEmailsResponse,
} from "@/app/api/user/stats/sender-emails/route";
import { ZodPeriod } from "@inboxzero/tinybird";
import { LoadingContent } from "@/components/LoadingContent";
import { type NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { SectionHeader } from "@/components/Typography";
import { EmailList } from "@/components/email-list/EmailList";
import { ThreadsResponse } from "@/app/api/google/threads/route";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function NewsletterModal(props: {
  newsletter?: NewsletterStatsResponse["newsletterCounts"][number];
  onClose: (isOpen: boolean) => void;
  refreshInterval: number;
}) {
  return (
    <Dialog open={!!props.newsletter} onOpenChange={props.onClose}>
      <DialogContent className="max-h-screen overflow-x-scroll overflow-y-scroll lg:min-w-[880px] xl:min-w-[1280px]">
        <DialogHeader>
          <DialogTitle>{props.newsletter?.name}</DialogTitle>
          <DialogDescription>
            <p>{props.newsletter?.name}</p>
          </DialogDescription>
        </DialogHeader>

        <div>
          <EmailsChart
            fromEmail={props.newsletter?.name!}
            period="week"
            refreshInterval={props.refreshInterval}
          />
        </div>
        <div className="lg:max-w-[820px] xl:max-w-[1220px]">
          <Emails
            fromEmail={props.newsletter?.name!}
            refreshInterval={props.refreshInterval}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmailsChart(props: {
  fromEmail: string;
  dateRange?: DateRange | undefined;
  period: ZodPeriod;
  refreshInterval: number;
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

function Emails(props: { fromEmail: string; refreshInterval: number }) {
  const [tab, setTab] = useState<"unarchived" | "all">("unarchived");
  const url = `/api/google/threads?&fromEmail=${encodeURIComponent(
    props.fromEmail
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
              refetch={mutate}
              emptyMessage="There are no unarchived emails."
            />
          )}
        </LoadingContent>
      </div>
    </>
  );
}
