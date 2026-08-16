"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DownloadIcon } from "lucide-react";
import type { ThreadMessage } from "@/components/email-list/types";
import { CardBasic } from "@/components/ui/card";
import { toastError } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchAttachment } from "@/utils/attachments/download";

export function EmailAttachments({ message }: { message: ThreadMessage }) {
  const { emailAccountId } = useAccount();
  const [downloadingAttachmentId, setDownloadingAttachmentId] = useState<
    string | null
  >(null);

  const downloadAttachment = async ({
    attachmentId,
    filename,
    url,
  }: {
    attachmentId: string;
    filename: string;
    url: string;
  }) => {
    setDownloadingAttachmentId(attachmentId);

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
      setDownloadingAttachmentId(null);
    }
  };

  return (
    <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-3">
      {message.attachments?.map((attachment) => {
        const searchParams = new URLSearchParams({
          messageId: message.id,
          attachmentId: attachment.attachmentId,
          mimeType: attachment.mimeType,
          filename: attachment.filename,
        });

        const url = `/api/messages/attachment?${searchParams.toString()}`;

        return (
          <CardBasic key={attachment.attachmentId} className="p-4">
            <div className="text-muted-foreground">{attachment.filename}</div>
            <div className="mt-4 flex items-center justify-between">
              <div className="text-muted-foreground">
                {mimeTypeToString(attachment.mimeType)}
              </div>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={downloadingAttachmentId === attachment.attachmentId}
                onClick={() =>
                  downloadAttachment({
                    attachmentId: attachment.attachmentId,
                    filename: attachment.filename,
                    url,
                  })
                }
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                Download
              </Button>
            </div>
          </CardBasic>
        );
      })}
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
