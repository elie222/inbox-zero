import type { EmailAttachmentMetadata } from "@inboxzero/email-editor/core";
import {
  CircleAlertIcon,
  ImageIcon,
  Loader2Icon,
  PaperclipIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/utils";
import type { ComposeAttachment } from "./compose-attachments";

export function ComposeAttachmentList({
  attachments,
  forwardedAttachments,
  isComposeWindow,
  onRemove,
}: {
  attachments: ComposeAttachment[];
  forwardedAttachments: Pick<
    EmailAttachmentMetadata,
    "id" | "filename" | "size"
  >[];
  isComposeWindow: boolean;
  onRemove: (attachment: ComposeAttachment) => void;
}) {
  if (!(attachments.length || forwardedAttachments.length)) return null;

  return (
    <ul
      aria-label="Attachments"
      className={cn(
        "flex flex-wrap gap-2",
        isComposeWindow && "shrink-0 px-4 py-2",
      )}
    >
      {forwardedAttachments.map((attachment) => (
        <li
          className="flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs"
          key={attachment.id}
          title="Included from the message you are forwarding"
        >
          <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />
          <span className="max-w-52 truncate">{attachment.filename}</span>
          <span className="text-muted-foreground">
            {formatFileSize(attachment.size)}
          </span>
        </li>
      ))}
      {attachments.map((attachment) => (
        <li
          aria-busy={attachment.status === "uploading" || undefined}
          className={cn(
            "flex max-w-full items-center gap-2 rounded-md border bg-muted/40 px-2 py-1 text-xs",
            attachment.status === "failed" &&
              "border-destructive/50 text-destructive",
          )}
          key={attachment.id}
          title={attachment.error}
        >
          <AttachmentIcon attachment={attachment} />
          <span className="max-w-52 truncate">{attachment.filename}</span>
          <span className="text-muted-foreground">
            {ATTACHMENT_STATUS_LABELS[attachment.status] ??
              formatFileSize(attachment.size)}
          </span>
          <button
            aria-label={`Remove ${attachment.filename}`}
            className="rounded-sm p-0.5 hover:bg-muted"
            onClick={() => onRemove(attachment)}
            type="button"
          >
            <XIcon className="size-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

const ATTACHMENT_STATUS_LABELS: Partial<
  Record<ComposeAttachment["status"], string>
> = {
  uploading: "Uploading…",
  failed: "Not attached",
};

function AttachmentIcon({ attachment }: { attachment: ComposeAttachment }) {
  if (attachment.status === "uploading")
    return (
      <Loader2Icon aria-hidden className="size-3.5 shrink-0 animate-spin" />
    );
  if (attachment.status === "failed")
    return <CircleAlertIcon aria-hidden className="size-3.5 shrink-0" />;
  if (attachment.disposition === "inline")
    return <ImageIcon aria-hidden className="size-3.5 shrink-0" />;
  return <PaperclipIcon aria-hidden className="size-3.5 shrink-0" />;
}

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
