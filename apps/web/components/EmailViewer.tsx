"use client";

import { useCallback } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useDisplayedEmail } from "@/hooks/useDisplayedEmail";
import { EmailThread } from "@/components/email-list/EmailPanel";
import { useThread } from "@/hooks/useThread";
import { LoadingContent } from "@/components/LoadingContent";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function EmailViewer() {
  const { threadId, showEmail } = useDisplayedEmail();

  const hideEmail = useCallback(() => showEmail(null), [showEmail]);

  return (
    <Sheet open={!!threadId} onOpenChange={hideEmail}>
      <SheetContent
        side="right"
        size="5xl"
        className="overflow-y-auto p-0"
        overlay="transparent"
      >
        {threadId && <EmailContent threadId={threadId} />}
      </SheetContent>
    </Sheet>
  );
}

function EmailContent({ threadId }: { threadId: string }) {
  const { data, isLoading, error, mutate } = useThread({ id: threadId });

  return (
    <ErrorBoundary extra={{ component: "EmailContent", threadId }}>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <EmailThread
            messages={data.thread.messages}
            refetch={mutate}
            showReplyButton={false}
          />
        )}
      </LoadingContent>
    </ErrorBoundary>
  );
}
