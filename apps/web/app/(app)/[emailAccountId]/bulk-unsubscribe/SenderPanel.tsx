"use client";

import useSWR from "swr";
import type React from "react";
import { useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowLeftIcon } from "lucide-react";
import type { NewsletterStatsResponse } from "@/app/api/user/stats/newsletters/route";
import type {
  SenderEmailsQuery,
  SenderEmailsResponse,
} from "@/app/api/user/stats/sender-emails/route";
import { BarChart } from "@/app/(app)/[emailAccountId]/stats/BarChart";
import { ActionCell } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/common";
import type { NewsletterFilterType } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/types";
import { isUnsubscribeSuggestion } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/suggestions";
import type { UserResponse } from "@/app/api/user/me/route";
import { ThreadList } from "@/app/(app)/[emailAccountId]/mail/ThreadList";
import type { ThreadsListResponse } from "@/app/api/threads/route";
import { ThreadContent } from "@/components/EmailViewer";
import { LoadingContent } from "@/components/LoadingContent";
import { SenderIcon } from "@/components/SenderIcon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  EmailLabelsProvider,
  useEmailLabels,
} from "@/providers/EmailLabelsProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";
import { cn } from "@/utils";
import { COLORS } from "@/utils/colors";
import { createSearchParams } from "@/utils/url";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

const EMAILS_TAB_PARAM = "sender-tab";

export function SenderPanel({
  newsletter,
  onClose,
  refreshInterval,
  ...actionProps
}: {
  newsletter?: Newsletter;
  onClose: () => void;
  refreshInterval?: number;
  hasUnsubscribeAccess: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  mutate: () => Promise<any>;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  openPremiumModal: () => void;
  filter: NewsletterFilterType;
}) {
  const [, setEmailsTab] = useQueryState(EMAILS_TAB_PARAM);

  const close = () => {
    setEmailsTab(null);
    onClose();
  };

  return (
    <Sheet open={!!newsletter} onOpenChange={(open) => !open && close()}>
      <SheetContent
        data-theme="mail"
        className="flex w-full flex-col gap-0 p-0 focus:outline-none sm:max-w-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {newsletter && (
          <EmailLabelsProvider>
            <SenderPanelContent
              key={newsletter.name}
              newsletter={newsletter}
              refreshInterval={refreshInterval}
              {...actionProps}
            />
          </EmailLabelsProvider>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SenderPanelContent({
  newsletter,
  refreshInterval,
  ...actionProps
}: {
  newsletter: Newsletter;
  refreshInterval?: number;
  hasUnsubscribeAccess: boolean;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
  mutate: () => Promise<any>;
  refetchPremium: () => Promise<UserResponse | null | undefined>;
  openPremiumModal: () => void;
  filter: NewsletterFilterType;
}) {
  const { emailAccountId, userEmail, provider } = useAccount();
  const { userLabels } = useLabels();
  const [openThreadId, setOpenThreadId] = useState<string>();

  const readPercentage =
    newsletter.value > 0
      ? Math.round((newsletter.readEmails / newsletter.value) * 100)
      : 0;
  const isLowReadRate = isUnsubscribeSuggestion(newsletter);

  return (
    <>
      <div className="flex items-center gap-3 px-4 pt-6 pb-5 pr-12 sm:px-6">
        <SenderIcon
          email={newsletter.name}
          name={newsletter.fromName}
          size={40}
        />
        <div className="min-w-0">
          <SheetTitle className="truncate font-title text-xl font-medium">
            {newsletter.fromName || newsletter.name}
          </SheetTitle>
          <SheetDescription className="truncate">
            {newsletter.name}
          </SheetDescription>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {openThreadId ? (
          <div className="px-4 pb-4 sm:px-6">
            <Button
              variant="ghost"
              size="sm"
              className="-ml-2 mb-2 text-muted-foreground"
              onClick={() => setOpenThreadId(undefined)}
            >
              <ArrowLeftIcon className="mr-1.5 size-4" />
              All emails
            </Button>
            <ThreadContent
              threadId={openThreadId}
              showReplyButton={isGoogleProvider(provider)}
            />
          </div>
        ) : (
          <>
            <div className="mx-4 grid grid-cols-3 divide-x rounded-lg border sm:mx-6">
              <Stat label="Emails" value={newsletter.value} />
              <Stat
                label="Read"
                value={`${readPercentage}%`}
                className={
                  isLowReadRate
                    ? "text-amber-600 dark:text-amber-400"
                    : undefined
                }
              />
              <Stat label="In inbox" value={newsletter.inboxEmails} />
            </div>

            <div className="px-4 pt-5 sm:px-6">
              <EmailsChart
                fromEmail={newsletter.name}
                refreshInterval={refreshInterval}
              />
            </div>

            <Tabs
              defaultValue="all"
              searchParam={EMAILS_TAB_PARAM}
              className="pt-5 pb-4"
            >
              <div className="flex items-center justify-between gap-3 px-4 sm:px-6">
                <h3 className="text-sm font-semibold">Emails</h3>
                <TabsList>
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="inbox">In inbox</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="all">
                <SenderEmails
                  fromEmail={newsletter.name}
                  type="all"
                  refreshInterval={refreshInterval}
                  onOpenThread={setOpenThreadId}
                />
              </TabsContent>
              <TabsContent value="inbox">
                <SenderEmails
                  fromEmail={newsletter.name}
                  refreshInterval={refreshInterval}
                  onOpenThread={setOpenThreadId}
                />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-1 border-t px-4 py-4 sm:px-6">
        <ActionCell
          item={newsletter}
          selected={false}
          labels={userLabels}
          userEmail={userEmail}
          emailAccountId={emailAccountId}
          {...actionProps}
        />
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className="px-4 py-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-xl font-semibold", className)}>
        {value}
      </div>
    </div>
  );
}

function EmailsChart({
  fromEmail,
  refreshInterval,
}: {
  fromEmail: string;
  refreshInterval?: number;
}) {
  const params: SenderEmailsQuery = { fromEmail, period: "week" };
  const { data, isLoading, error } = useSWR<
    SenderEmailsResponse,
    { error: string }
  >(`/api/user/stats/sender-emails/?${createSearchParams(params)}`, {
    refreshInterval,
  });

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <BarChart
          data={data.result}
          config={{
            Emails: { label: "Emails", color: COLORS.analytics.green },
          }}
          xAxisKey="startOfPeriod"
          period="week"
        />
      )}
    </LoadingContent>
  );
}

function SenderEmails({
  fromEmail,
  type,
  refreshInterval,
  onOpenThread,
}: {
  fromEmail: string;
  type?: "all";
  refreshInterval?: number;
  onOpenThread: (threadId: string) => void;
}) {
  const { userEmail } = useAccount();
  const { userLabels } = useEmailLabels();
  const query = createSearchParams({ fromEmail, type, view: "list" });
  const { data, isLoading, error } = useSWR<ThreadsListResponse>(
    `/api/threads?${query}`,
    { refreshInterval },
  );
  const threads = data?.threads ?? [];

  return (
    <LoadingContent loading={isLoading} error={error}>
      <ThreadList
        threads={threads}
        emptyMessage={
          type === "all"
            ? "No emails from this sender"
            : "None of this sender's emails are in your inbox"
        }
        layout="list"
        expandedPreview={false}
        userEmail={userEmail}
        userLabels={userLabels}
        selectionEnabled={false}
        focusedIndex={-1}
        isSelected={noSelection}
        selectedCount={0}
        onOpenThread={(index) => {
          const thread = threads[index];
          if (thread) onOpenThread(thread.id);
        }}
        onToggleSelect={noop}
        onSelectRangeTo={noop}
        showLoadMore={false}
        isLoadingMore={false}
        onLoadMore={noop}
        listKey={`bulk-unsubscribe:${fromEmail}:${type ?? "inbox"}`}
      />
    </LoadingContent>
  );
}

function noSelection() {
  return false;
}

function noop() {}
