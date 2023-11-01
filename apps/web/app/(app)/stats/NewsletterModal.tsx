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
import { parseFromEmail } from "@/utils/email";

export function NewsletterModal(props: {
  newsletter?: NewsletterStatsResponse["newsletterCounts"][number];
  onClose: (isOpen: boolean) => void;
}) {
  return (
    <Dialog open={!!props.newsletter} onOpenChange={props.onClose}>
      <DialogContent className="max-h-screen overflow-x-scroll overflow-y-scroll lg:min-w-[1280px]">
        <DialogHeader>
          <DialogTitle>{props.newsletter?.name}</DialogTitle>
          <DialogDescription>
            <p>{props.newsletter?.name}</p>
          </DialogDescription>
        </DialogHeader>

        <div>
          <EmailsChart fromEmail={props.newsletter?.name!} period="week" />
        </div>
        <div className="lg:max-w-[1220px]">
          <Emails fromEmail={props.newsletter?.name!} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EmailsChart(props: {
  fromEmail: string;
  dateRange?: DateRange | undefined;
  period: ZodPeriod;
}) {
  const params: SenderEmailsQuery = {
    ...props,
    ...getDateRangeParams(props.dateRange),
  };
  const { data, isLoading, error } = useSWR<
    SenderEmailsResponse,
    { error: string }
  >(`/api/user/stats/sender-emails/?${new URLSearchParams(params as any)}`);

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

function Emails(props: { fromEmail: string }) {
  const fromEmail = parseFromEmail(props.fromEmail);
  const { data, isLoading, error, mutate } = useSWR<ThreadsResponse>(
    `/api/google/threads?&fromEmail=${fromEmail}`
  );

  return (
    <>
      <SectionHeader>Emails</SectionHeader>
      <div className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <EmailList
              threads={data.threads}
              refetch={mutate}
              emptyMessage="There are no emails."
            />
          )}
        </LoadingContent>
      </div>
    </>
  );
}
