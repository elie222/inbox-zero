"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon, ImageIcon } from "lucide-react";
import type { ThreadMessage } from "@/components/email-list/types";
import { CardBasic } from "@/components/ui/card";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  fetchAttachment,
  getAttachmentUrl,
} from "@/utils/attachments/download";

export function EmailAttachments({ message }: { message: ThreadMessage }) {
  const { emailAccountId } = useAccount();
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadAttachment = async ({
    filename,
    url,
  }: {
    filename: string;
    url: string;
  }) => {
    setIsDownloading(true);

    try {
      const blob = await fetchAttachment({ url, emailAccountId });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
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
            {attachment.mimeType.startsWith("image/") && emailAccountId ? (
              <AttachmentImagePreview
                key={`${emailAccountId}:${url}`}
                emailAccountId={emailAccountId}
                filename={attachment.filename}
                url={url}
              />
            ) : null}
            <div className="p-4">
              <div className="truncate text-sm" title={attachment.filename}>
                {attachment.filename}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-muted-foreground">
                  {mimeTypeToString(attachment.mimeType)}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!emailAccountId || isDownloading}
                  onClick={() =>
                    downloadAttachment({
                      filename: attachment.filename,
                      url,
                    })
                  }
                >
                  <DownloadIcon className="mr-2 h-4 w-4" />
                  Download
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
  url,
}: {
  emailAccountId: string;
  filename: string;
  url: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;

    fetchAttachment({ url, emailAccountId }).then(
      (blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPreviewUrl(objectUrl);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [emailAccountId, url]);

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
