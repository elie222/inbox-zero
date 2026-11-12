"use client";

import { Trans } from "@lingui/react/macro";
import Image from "next/image";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { DownloadIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { getAttachmentPreview } from "@inboxzero/mail-ui/image-preview";
import { fetchAttachment, saveBlob } from "@/utils/attachments/download";

const PREVIEW_MAX_BYTES = 50 * 1024 * 1024;
type PreviewError = "too_large" | "unavailable" | "load_failed";
type AttachmentPreview = {
  filename: string;
  size: number;
  url: string;
  emailAccountId: string;
};

const PreviewContext = createContext<
  ((preview: AttachmentPreview) => void) | null
>(null);

export function AttachmentPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Retain the selected file independently of message hydration and expansion.
  const [preview, setPreview] = useState<AttachmentPreview>();
  return (
    <PreviewContext.Provider value={setPreview}>
      {children}
      <Dialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open) setPreview(undefined);
        }}
      >
        {preview && (
          <AttachmentPreviewDialogContent key={preview.url} {...preview} />
        )}
      </Dialog>
    </PreviewContext.Provider>
  );
}

export function useAttachmentPreview() {
  const openPreview = useContext(PreviewContext);
  if (!openPreview)
    throw new Error("Attachment preview requires AttachmentPreviewProvider");
  return openPreview;
}

function AttachmentPreviewDialogContent({
  filename,
  size,
  url,
  emailAccountId,
}: AttachmentPreview) {
  const tooLarge = size > PREVIEW_MAX_BYTES;
  const [file, setFile] = useState<Blob>();
  const [preview, setPreview] = useState<{ url: string; type: string }>();
  const [error, setError] = useState<PreviewError | undefined>(
    tooLarge ? "too_large" : undefined,
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
          setError("unavailable");
          return;
        }
        objectUrl = URL.createObjectURL(typed);
        setPreview({ url: objectUrl, type: typed.type });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("load_failed");
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
          <Trans>Attachment preview</Trans>
        </DialogDescription>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!file}
          onClick={() => file && saveBlob(file, filename)}
        >
          <DownloadIcon className="mr-2 size-4" aria-hidden="true" />
          <Trans>Download</Trans>
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
  error?: PreviewError;
}) {
  if (error)
    return (
      <p className="text-muted-foreground text-sm">
        {error === "too_large" && (
          <Trans>This file is too large to preview.</Trans>
        )}
        {error === "unavailable" && (
          <Trans>Preview isn't available for this file.</Trans>
        )}
        {error === "load_failed" && (
          <Trans>Couldn't load this attachment.</Trans>
        )}
      </p>
    );
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
