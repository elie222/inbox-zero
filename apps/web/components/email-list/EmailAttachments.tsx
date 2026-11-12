"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useAttachmentPreview } from "./AttachmentPreview";
import { getAttachmentFileType } from "./attachment-file-type";
import { useOpenedConversationAttachments } from "./OpenedConversationAttachments";
import Image from "next/image";
import { useEffect, useState, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon, ImageIcon, Loader2 } from "lucide-react";
import type { ThreadMessage } from "@/components/email-list/types";
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

type Attachment = NonNullable<ThreadMessage["attachments"]>[number];

export function EmailAttachments({ message }: { message: ThreadMessage }) {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const openPreview = useAttachmentPreview();
  const [downloading, setDownloading] = useState<string>();
  const attachments = message.attachments ?? [];

  const urlFor = (attachment: Attachment) =>
    emailAccountId
      ? getAttachmentUrl({
          accountId: emailAccountId,
          messageId: message.id,
          attachmentId: attachment.attachmentId,
        })
      : "";
  const toPreview = (attachment: Attachment) => ({
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: urlFor(attachment),
    emailAccountId,
  });
  const images = emailAccountId
    ? attachments.filter((attachment) =>
        isPreviewableImageType(attachment.mimeType),
      )
    : [];

  const controller = useRef(new AbortController());
  useEffect(() => {
    if (!emailAccountId || !message.id) return;
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, [emailAccountId, message.id]);

  const download = async (targets: Attachment[], id: string) => {
    const signal = controller.current.signal;
    setDownloading(id);

    // Fetch everything first so the saves run back-to-back, and keep going
    // past a failed file so the rest still download.
    const results = await Promise.allSettled(
      targets.map(async (attachment) => ({
        attachment,
        blob: await fetchAttachment({
          url: urlFor(attachment),
          emailAccountId,
          signal,
        }),
      })),
    );
    setDownloading(undefined);
    if (signal.aborted) return;

    let failed = 0;
    for (const result of results) {
      if (result.status === "fulfilled")
        saveBlob(result.value.blob, result.value.attachment.filename);
      else failed++;
    }
    if (failed === 1 && targets.length === 1)
      toastError({ description: t`Failed to download attachment` });
    else if (failed) {
      const total = targets.length;
      toastError({
        description: t`${failed} of ${total} attachments failed to download`,
      });
    }
  };

  if (!attachments.length) return null;

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        {attachments.map((attachment) => {
          const tileProps = {
            filename: attachment.filename,
            onDownload: () => download([attachment], attachment.attachmentId),
            downloadDisabled: !emailAccountId || !!downloading,
            isDownloading: downloading === attachment.attachmentId,
          };

          if (emailAccountId && isPreviewableImageType(attachment.mimeType))
            return (
              <AttachmentTile
                key={attachment.attachmentId}
                {...tileProps}
                onPreview={() =>
                  openPreview({
                    items: images.map(toPreview),
                    index: images.indexOf(attachment),
                  })
                }
              >
                <AttachmentImageThumbnail
                  key={`${emailAccountId}:${urlFor(attachment)}`}
                  emailAccountId={emailAccountId}
                  messageId={message.id}
                  attachment={attachment}
                />
              </AttachmentTile>
            );

          const fileType = getAttachmentFileType(attachment);
          return (
            <AttachmentTile
              key={attachment.attachmentId}
              {...tileProps}
              onPreview={
                emailAccountId && isPreviewableAttachment(attachment)
                  ? () =>
                      openPreview({ items: [toPreview(attachment)], index: 0 })
                  : undefined
              }
            >
              <div className="flex size-full flex-col justify-between bg-muted/50 p-3">
                <div className="line-clamp-3 break-words font-medium text-foreground/90 text-sm leading-snug">
                  {stripExtension(attachment.filename)}
                </div>
                <span
                  className={cn(
                    "self-start rounded px-1.5 py-0.5 font-semibold text-[10px] tracking-wide",
                    fileType.className,
                  )}
                >
                  {fileType.label}
                </span>
              </div>
            </AttachmentTile>
          );
        })}
      </div>

      {attachments.length > 1 ? (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1.5 rounded-md py-1 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          disabled={!emailAccountId || !!downloading}
          onClick={() => download(attachments, "all")}
        >
          {downloading === "all" ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <DownloadIcon className="size-4" aria-hidden="true" />
          )}
          <Trans>Download all</Trans>
        </button>
      ) : null}
    </div>
  );
}

function AttachmentTile({
  filename,
  onPreview,
  onDownload,
  downloadDisabled,
  isDownloading,
  children,
}: {
  filename: string;
  onPreview?: () => void;
  onDownload: () => void;
  downloadDisabled: boolean;
  isDownloading: boolean;
  children: ReactNode;
}) {
  const { t } = useLingui();
  const downloadIcon = isDownloading ? (
    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
  ) : (
    <DownloadIcon className="size-4" aria-hidden="true" />
  );
  const revealClassName =
    !isDownloading &&
    "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

  return (
    <div
      className="group relative h-28 w-40 overflow-hidden rounded-lg border border-border/70 bg-background shadow-xs transition-shadow hover:shadow-md"
      title={filename}
    >
      {children}
      {/* Files without a preview download when the tile is clicked. */}
      <button
        type="button"
        className="absolute inset-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:cursor-default"
        aria-label={
          onPreview ? t`Preview ${filename}` : t`Download ${filename}`
        }
        disabled={!onPreview && downloadDisabled}
        onClick={onPreview ?? onDownload}
      />
      {onPreview ? (
        <Button
          variant="outline"
          size="iconSm"
          type="button"
          className={cn(
            "absolute right-2 bottom-2 size-7 bg-background/90 shadow-sm backdrop-blur transition-opacity",
            revealClassName,
          )}
          aria-label={t`Download ${filename}`}
          disabled={downloadDisabled}
          onClick={onDownload}
        >
          {downloadIcon}
        </Button>
      ) : (
        <span
          className={cn(
            "pointer-events-none absolute right-2 bottom-2 flex size-7 items-center justify-center rounded-md border bg-background/90 shadow-sm transition-opacity",
            revealClassName,
          )}
        >
          {downloadIcon}
        </span>
      )}
    </div>
  );
}

function AttachmentImageThumbnail({
  emailAccountId,
  messageId,
  attachment,
}: {
  emailAccountId: string;
  messageId: string;
  attachment: Attachment;
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
        ? session?.load(
            messageId,
            attachment.attachmentId,
            controller.signal,
            attachment,
          )
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
  }, [emailAccountId, session, messageId, attachment]);

  return (
    <div className="pointer-events-none relative flex size-full items-center justify-center bg-muted/50">
      {previewUrl ? (
        <Image
          fill
          unoptimized
          alt={attachment.filename}
          className="object-cover"
          sizes="160px"
          src={previewUrl}
        />
      ) : failed ? (
        <ImageIcon className="size-7 text-muted-foreground/60" />
      ) : (
        <div className="size-full animate-pulse bg-muted" />
      )}
    </div>
  );
}

function stripExtension(filename: string) {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(0, dot) : filename;
}
