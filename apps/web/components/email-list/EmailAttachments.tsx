"use client";

import { useLingui } from "@lingui/react/macro";
import { useAttachmentPreview } from "./AttachmentPreview";
import { useOpenedConversationAttachments } from "./OpenedConversationAttachments";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon, ImageIcon } from "lucide-react";
import type { ThreadMessage } from "@/components/email-list/types";
import { CardBasic } from "@/components/ui/card";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { cn } from "@/utils";
import {
  isPreviewableAttachment,
  isPreviewableImageType,
} from "@inboxzero/mail-ui/image-preview";
import {
  fetchAttachment,
  getAttachmentUrl,
  saveBlob,
} from "@/utils/attachments/download";

export function EmailAttachments({ message }: { message: ThreadMessage }) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const [isDownloading, setIsDownloading] = useState(false);
  const openPreview = useAttachmentPreview();
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
        toastError({ description: t`Failed to download attachment` });
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
                aria-label={t`Preview ${attachment.filename}`}
                title={attachment.filename}
                onClick={() =>
                  openPreview({
                    filename: attachment.filename,
                    size: attachment.size,
                    url,
                    emailAccountId,
                  })
                }
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
                  aria-label={t`Download ${attachment.filename}`}
                  title={t`Download attachment`}
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
