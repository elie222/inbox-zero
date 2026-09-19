"use client";

import { useOpenedConversationAttachments } from "./OpenedConversationAttachments";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon, ImageIcon } from "lucide-react";
import type { ThreadMessage } from "@/components/email-list/types";
import { CardBasic } from "@/components/ui/card";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { isPreviewableImageType } from "@/utils/attachments/image-preview";
import { getAttachmentUrl } from "@/utils/attachments/download";

export function EmailAttachments({ message }: { message: ThreadMessage }) {
  const { emailAccountId } = useAccount();
  const [isDownloading, setIsDownloading] = useState(false);
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
    attachmentId,
    size,
  }: {
    filename: string;
    url: string;
    attachmentId: string;
    size: number;
  }) => {
    const signal = controller.current.signal;
    setIsDownloading(true);

    try {
      const link = document.createElement("a");
      const downloadUrl = new URL(url, window.location.origin);
      downloadUrl.searchParams.set("emailAccountId", emailAccountId);
      link.href = downloadUrl.toString();
      link.download = filename;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
      }
      signal.throwIfAborted();
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
        const url = getAttachmentUrl({
          messageId: message.id,
          attachmentId: attachment.attachmentId,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        });

        return (
          <CardBasic
            key={attachment.attachmentId}
            className="overflow-hidden p-0"
          >
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
                  aria-label={`Download ${attachment.filename}`}
                  title="Download attachment"
                  disabled={!emailAccountId || isDownloading}
                  onClick={() =>
                    downloadAttachment({
                      filename: attachment.filename,
                      url,
                      attachmentId: attachment.attachmentId,
                      size: attachment.size,
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
    </div>
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
    <div className="relative flex aspect-video items-center justify-center overflow-hidden border-border/60 border-b bg-muted/40">
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
