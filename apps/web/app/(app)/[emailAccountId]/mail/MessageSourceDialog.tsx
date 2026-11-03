"use client";

import useSWR from "swr";
import { CopyIcon, DownloadIcon } from "lucide-react";
import {
  fetchMessageSource,
  saveMessageSource,
} from "@/app/(app)/[emailAccountId]/mail/message-source";
import { LoadingContent } from "@/components/LoadingContent";
import { toastSuccess } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function MessageSourceDialog({
  emailAccountId,
  messageId,
  subject,
  open,
  onOpenChange,
}: {
  emailAccountId: string;
  messageId: string;
  subject: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, error, isLoading } = useSWR(
    open ? ["message-source", emailAccountId, messageId] : null,
    async () => {
      const source = await fetchMessageSource({ emailAccountId, messageId });
      return { source, text: await source.text() };
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="flex max-h-[85vh] max-w-4xl flex-col"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Original message</DialogTitle>
        </DialogHeader>
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(data.text)
                      .then(() =>
                        toastSuccess({ description: "Copied to clipboard" }),
                      )
                  }
                >
                  <CopyIcon className="mr-2 size-4" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveMessageSource(data.source, subject)}
                >
                  <DownloadIcon className="mr-2 size-4" />
                  Download
                </Button>
              </div>
              <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/50 p-3 font-mono text-xs">
                {data.text}
              </pre>
            </>
          )}
        </LoadingContent>
      </DialogContent>
    </Dialog>
  );
}
