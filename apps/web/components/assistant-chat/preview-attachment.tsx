"use client";

import Image from "next/image";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Attachment } from "@/providers/ChatProvider";

type PreviewableAttachment = Pick<Attachment, "name" | "url" | "contentType">;

export function PreviewAttachment({
  attachment,
  onRemove,
  isUploading,
}: {
  attachment: PreviewableAttachment;
  onRemove?: () => void;
  isUploading?: boolean;
}) {
  const { name, url, contentType } = attachment;

  return (
    <div className="group relative size-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
      {contentType.startsWith("image") ? (
        <Image
          alt={name}
          className="size-full object-cover"
          src={url}
          height={64}
          width={64}
          unoptimized
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
          File
        </div>
      )}

      {isUploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        </div>
      )}

      {onRemove && !isUploading && (
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-0.5 right-0.5 size-5 rounded-full bg-black/60 p-0 text-white opacity-0 hover:bg-black/80 group-hover:opacity-100"
          onClick={onRemove}
        >
          <XIcon className="size-3" />
        </Button>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-2 text-[10px] text-white">
        {name}
      </div>
    </div>
  );
}
