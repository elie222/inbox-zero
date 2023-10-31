import useSWR from "swr";
import { BarChart } from "@tremor/react";
import { Button } from "@/components/ui/button";
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

export function NewsletterModal(props: {
  newsletter?: NewsletterStatsResponse["newsletterCounts"][number];
  onClose: (isOpen: boolean) => void;
}) {
  return (
    <Dialog open={!!props.newsletter} onOpenChange={props.onClose}>
      <DialogContent className="md:min-w-[1000px]">
        <DialogHeader>
          <DialogTitle>{props.newsletter?.name}</DialogTitle>
          <DialogDescription>
            <p>{props.newsletter?.name}</p>
          </DialogDescription>
          {/* <div className="mt-4">
            <Button>Unsuscribe</Button>
          </div> */}
          <div>
            <EmailsChart fromEmail={props.newsletter?.name!} period="week" />
          </div>
          <Emails />
        </DialogHeader>
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

function Emails() {
  return <div></div>;
}
