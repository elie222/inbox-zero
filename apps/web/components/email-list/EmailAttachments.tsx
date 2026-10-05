"use client";

import { useOpenedConversationAttachments } from "./OpenedConversationAttachments";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon, ImageIcon, Loader2 } from "lucide-react";
import type { ThreadMessage } from "@/components/email-list/types";
import { CardBasic } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  getAttachmentPreview,
  isPreviewableAttachment,
  isPreviewableImageType,
} from "@/utils/attachments/image-preview";
import {
  fetchAttachment,
  getAttachmentUrl,
  saveBlob,
} from "@/utils/attachments/download";

const PREVIEW_MAX_BYTES = 50 * 1024 * 1024;

export function EmailAttachments({ message }: { message: ThreadMessage }) {
  const { emailAccountId } = useAccount();
  const [isDownloading, setIsDownloading] = useState(false);
  const [previewingId, setPreviewingId] = useState<string>();
  const previewing = message.attachments?.find(
    (attachment) => attachment.attachmentId === previewingId,
  );
  // Close for good if the attachment disappears so it can't reopen on its own later.
  if (previewingId && !previewing) setPreviewingId(undefined);
  // Keyed by URL so a different account or message never shows a stale file.
  const previewUrl =
    previewing && emailAccountId
      ? getAttachmentUrl({
          accountId: emailAccountId,
          messageId: message.id,
          attachmentId: previewing.attachmentId,
        })
      : "";
  const controller = useRef(new AbortController());
  useEffect(() => {
    if (!emailAccountId || !message.id) return;
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, [emailAccountId, message.id]);

  const downloadAttachment = async ({
    filename,
    url,
  }: {
    filename: string;
    url: string;
  }) => {
    const signal = controller.current.signal;
    setIsDownloading(true);

    try {
      const blob = await fetchAttachment({
        url,
        emailAccountId,
        signal,
      });
      signal.throwIfAborted();
      saveBlob(blob, filename);
    } catch {
      if (!signal.aborted)
        toastError({ description: "Failed to download attachment" });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {message.attachments?.map((attachment) => {
        const url = emailAccountId
          ? getAttachmentUrl({
              accountId: emailAccountId,
              messageId: message.id,
              attachmentId: attachment.attachmentId,
            })
          : "";

        const canPreview =
          !!emailAccountId && isPreviewableAttachment(attachment);

        return (
          <CardBasic
            key={attachment.attachmentId}
            className={cn(
              "relative overflow-hidden p-0",
              canPreview && "transition-colors hover:bg-muted/40",
            )}
          >
            {canPreview ? (
              <button
                type="button"
                className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-label={`Preview ${attachment.filename}`}
                title={attachment.filename}
                onClick={() => setPreviewingId(attachment.attachmentId)}
              />
            ) : null}
            {isPreviewableImageType(attachment.mimeType) && emailAccountId ? (
              <AttachmentImagePreview
                key={`${emailAccountId}:${url}`}
                emailAccountId={emailAccountId}
                filename={attachment.filename}
                messageId={message.id}
                attachmentId={attachment.attachmentId}
                attachment={attachment}
              />
            ) : null}
            <div className="p-4">
              <div className="truncate text-sm" title={attachment.filename}>
                {attachment.filename}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div
                  className="min-w-0 truncate text-muted-foreground"
                  title={mimeTypeToString(attachment.mimeType)}
                >
                  {mimeTypeToString(attachment.mimeType)}
                </div>
                <Button
                  variant="outline"
                  size="iconSm"
                  type="button"
                  className="relative"
                  aria-label={`Download ${attachment.filename}`}
                  title="Download attachment"
                  disabled={!emailAccountId || isDownloading}
                  onClick={() =>
                    downloadAttachment({
                      filename: attachment.filename,
                      url,
                    })
                  }
                >
                  <DownloadIcon className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </CardBasic>
        );
      })}
      <Dialog
        open={!!previewing}
        onOpenChange={(open) => {
          if (!open) setPreviewingId(undefined);
        }}
      >
        {previewing && emailAccountId ? (
          <AttachmentPreviewDialogContent
            key={previewUrl}
            filename={previewing.filename}
            size={previewing.size}
            url={previewUrl}
            emailAccountId={emailAccountId}
          />
        ) : null}
      </Dialog>
    </div>
  );
}

function AttachmentPreviewDialogContent({
  filename,
  size,
  url,
  emailAccountId,
}: {
  filename: string;
  size: number;
  url: string;
  emailAccountId: string;
}) {
  const tooLarge = size > PREVIEW_MAX_BYTES;
  const [file, setFile] = useState<Blob>();
  const [preview, setPreview] = useState<{ url: string; type: string }>();
  const [error, setError] = useState<string | undefined>(
    tooLarge ? "This file is too large to preview." : undefined,
  );

  useEffect(() => {
    if (tooLarge) return;
    const controller = new AbortController();
    let objectUrl: string | undefined;

    fetchAttachment({
      url,
      emailAccountId,
      signal: controller.signal,
      maxBytes: PREVIEW_MAX_BYTES,
    })
      .then(async (blob) => {
        const typed = await getAttachmentPreview(blob);
        if (controller.signal.aborted) return;
        setFile(blob);
        if (!typed) {
          setError("Preview isn't available for this file.");
          return;
        }
        objectUrl = URL.createObjectURL(typed);
        setPreview({ url: objectUrl, type: typed.type });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Couldn't load this attachment.");
      });

    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, emailAccountId, tooLarge]);

  return (
    <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b py-3 pr-12 pl-4">
        <DialogTitle className="min-w-0 flex-1 truncate font-medium text-sm">
          {filename}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Attachment preview
        </DialogDescription>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!file}
          onClick={() => file && saveBlob(file, filename)}
        >
          <DownloadIcon className="mr-2 size-4" aria-hidden="true" />
          Download
        </Button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-muted/40">
        <AttachmentPreviewBody
          filename={filename}
          preview={preview}
          error={error}
        />
      </div>
    </DialogContent>
  );
}

function AttachmentPreviewBody({
  filename,
  preview,
  error,
}: {
  filename: string;
  preview?: { url: string; type: string };
  error?: string;
}) {
  if (error) return <p className="text-muted-foreground text-sm">{error}</p>;
  if (!preview)
    return <Loader2 className="size-6 animate-spin text-muted-foreground" />;
  if (preview.type === "application/pdf")
    return (
      <iframe
        title={filename}
        src={preview.url}
        className="size-full border-0"
      />
    );
  return (
    <Image
      fill
      unoptimized
      alt={filename}
      className="object-contain"
      sizes="(min-width: 1024px) 64rem, 100vw"
      src={preview.url}
    />
  );
}

function AttachmentImagePreview({
  emailAccountId,
  filename,
  messageId,
  attachmentId,
  attachment,
}: {
  emailAccountId: string;
  filename: string;
  messageId: string;
  attachmentId: string;
  attachment: NonNullable<ThreadMessage["attachments"]>[number];
}) {
  const session = useOpenedConversationAttachments();
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    let objectUrl: string | undefined;

    (
      (emailAccountId
        ? session?.load(messageId, attachmentId, controller.signal, attachment)
        : undefined) ?? Promise.resolve(undefined)
    ).then(
      (blob) => {
        if (cancelled) return;
        if (!blob) {
          setFailed(true);
          return;
        }
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [emailAccountId, session, messageId, attachmentId, attachment]);

  return (
    <div className="pointer-events-none relative flex aspect-video items-center justify-center overflow-hidden border-border/60 border-b bg-muted/40">
      {previewUrl ? (
        <Image
          fill
          unoptimized
          alt={filename}
          className="object-contain"
          sizes="(min-width: 1280px) 33vw, 50vw"
          src={previewUrl}
        />
      ) : failed ? (
        <ImageIcon className="size-8 text-muted-foreground/60" />
      ) : (
        <div className="size-full animate-pulse bg-muted" />
      )}
    </div>
  );
}

function mimeTypeToString(mimeType: string): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/zip":
      return "ZIP";
    case "image/png":
      return "PNG";
    case "image/jpeg":
      return "JPEG";
    // LLM generated. Need to check they're actually needed
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
      return "XLSX";
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return "PPTX";
    case "application/vnd.ms-excel":
      return "XLS";
    case "application/vnd.ms-powerpoint":
      return "PPT";
    case "application/msword":
      return "DOC";
    default:
      return mimeType;
  }
}
