import React, { useState } from "react";
import useSWRImmutable from "swr/immutable";
import {
  Card,
  ProgressBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  Title,
} from "@tremor/react";
import { ArrowDownIcon, ChevronDown, ChevronsUpDownIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import { useExpanded } from "@/app/(app)/stats/useExpanded";
import { Button } from "@/components/ui/button";

export function NewsletterStats() {
  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");
  const { data, isLoading, error } = useSWRImmutable<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?orderBy=${sortColumn}`);

  const { expanded, extra } = useExpanded();

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <Card>
          <Title>Which newsletters do you get the most?</Title>
          <Table className="mt-6">
            <TableHead>
              <TableRow>
                <TableHeaderCell>
                  <span className="text-sm font-medium">Newsletter</span>
                </TableHeaderCell>
                <TableHeaderCell>
                  <HeaderButton
                    sorted={sortColumn === "emails"}
                    onClick={() => setSortColumn("emails")}
                  >
                    Emails
                  </HeaderButton>
                </TableHeaderCell>
                <TableHeaderCell>
                  <HeaderButton
                    sorted={sortColumn === "unread"}
                    onClick={() => setSortColumn("unread")}
                  >
                    Read
                  </HeaderButton>
                </TableHeaderCell>
                <TableHeaderCell>
                  <HeaderButton
                    sorted={sortColumn === "unarchived"}
                    onClick={() => setSortColumn("unarchived")}
                  >
                    Archived
                  </HeaderButton>
                </TableHeaderCell>
                <TableHeaderCell></TableHeaderCell>
                {/* <TableHeaderCell>Auto label and archive</TableHeaderCell> */}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.newsletterCounts
                .slice(0, expanded ? undefined : 10)
                .map((item) => {
                  const readPercentage = (item.readEmails / item.value) * 100;
                  const archivedEmails = item.value - item.inboxEmails;
                  const archivedPercentage =
                    (archivedEmails / item.value) * 100;

                  return (
                    <TableRow key={item.name}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.value}</TableCell>
                      <TableCell>
                        <ProgressBar
                          label={`${Math.round(readPercentage)}%`}
                          value={readPercentage}
                          tooltip={`${item.readEmails} read. ${
                            item.value - item.readEmails
                          } unread.`}
                          color="blue"
                          className="w-[150px]"
                        />
                      </TableCell>
                      <TableCell>
                        <ProgressBar
                          label={`${Math.round(archivedPercentage)}%`}
                          value={archivedPercentage}
                          tooltip={`${archivedEmails} archived. ${item.inboxEmails} unarchived.`}
                          color="blue"
                          className="w-[150px]"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={!item.lastUnsubscribeLink}
                          onClick={() =>
                            window.open(item.lastUnsubscribeLink, "_blank")
                          }
                        >
                          Unsubscribe
                        </Button>
                      </TableCell>
                      {/* <TableCell>
                        <Button
                          size="xs"
                          variant="secondary"
                          color="blue"
                          onClick={() => alert("Not implemented yet")}
                        >
                          Auto archive
                        </Button>
                      </TableCell> */}
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          <div className="mt-2">{extra}</div>
        </Card>
      )}
    </LoadingContent>
  );
}

function HeaderButton(props: {
  children: React.ReactNode;
  sorted: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="data-[state=open]:bg-accent -ml-3 h-8"
      onClick={props.onClick}
    >
      <span>{props.children}</span>
      {props.sorted ? (
        <ChevronDown className="ml-2 h-4 w-4" />
      ) : (
        <ChevronsUpDownIcon className="ml-2 h-4 w-4" />
      )}
    </Button>
  );
}
