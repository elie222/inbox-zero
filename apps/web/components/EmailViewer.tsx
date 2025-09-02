"use client";

import { useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { EmailThread } from "@/components/email-list/EmailThread";
import { useThread } from "@/hooks/useThread";
import { LoadingContent } from "@/components/LoadingContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isGoogleProvider } from "@/utils/email/provider-types";

export function EmailViewer() {
  const { provider } = useAccount();

  const { threadId, showEmail, showReplyButton, autoOpenReplyForMessageId } =
    useDisplayedEmail();

  const hideEmail = useCallback(() => showEmail(null), [showEmail]);

  return (
    <Sheet open={!!threadId} onOpenChange={hideEmail}>
      <SheetContent
        side="right"
        size="5xl"
        className="overflow-y-auto bg-slate-100 p-0"
        overlay="transparent"
      >
        {isGoogleProvider(provider) ? (
          threadId && (
            <ThreadContent
              threadId={threadId}
              showReplyButton={showReplyButton}
              autoOpenReplyForMessageId={autoOpenReplyForMessageId ?? undefined}
            />
          )
        ) : (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-muted-foreground">
              This feature isn't enabled for Outlook.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function ThreadContent({
  threadId,
  showReplyButton,
  autoOpenReplyForMessageId,
  topRightComponent,
  onSendSuccess,
}: {
  threadId: string;
  showReplyButton: boolean;
  autoOpenReplyForMessageId?: string;
  topRightComponent?: React.ReactNode;
  onSendSuccess?: (messageId: string, threadId: string) => void;
}) {
  const { data, isLoading, error, mutate } = useThread(
    { id: threadId },
    {
      includeDrafts: true,
    },
  );

  return (
    <ErrorBoundary extra={{ component: "ThreadContent", threadId }}>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <EmailThread
            key={data.thread.id}
            messages={data.thread.messages}
            refetch={mutate}
            showReplyButton={showReplyButton}
            autoOpenReplyForMessageId={autoOpenReplyForMessageId}
            topRightComponent={topRightComponent}
            onSendSuccess={onSendSuccess}
            withHeader
          />
        )}
      </LoadingContent>
    </ErrorBoundary>
  );
}
