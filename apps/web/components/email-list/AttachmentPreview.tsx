"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import Image from "next/image";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  Loader2,
  XIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/utils";
import {
  getAttachmentPreview,
  isPreviewableImageType,
} from "@inboxzero/mail-ui/image-preview";
import { fetchAttachment, saveBlob } from "@/utils/attachments/download";
import { getAttachmentFileType } from "./attachment-file-type";

const PREVIEW_MAX_BYTES = 50 * 1024 * 1024;
type PreviewError = "too_large" | "unavailable" | "load_failed";
type AttachmentPreview = {
  filename: string;
  mimeType: string;
  size: number;
  url: string;
  emailAccountId: string;
};
type Gallery = { items: AttachmentPreview[]; index: number };

const PreviewContext = createContext<((gallery: Gallery) => void) | null>(null);

export function AttachmentPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Retain the selected file independently of message hydration and expansion.
  const [gallery, setGallery] = useState<Gallery>();
  const current = gallery?.items[gallery.index];
  return (
    <PreviewContext.Provider value={setGallery}>
      {children}
      <Dialog
        open={!!current}
        onOpenChange={(open) => {
          if (!open) setGallery(undefined);
        }}
      >
        {gallery && current ? (
          <AttachmentViewer
            gallery={gallery}
            current={current}
            onNavigate={(offset) =>
              setGallery({ ...gallery, index: gallery.index + offset })
            }
            onClose={() => setGallery(undefined)}
          />
        ) : null}
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

function AttachmentViewer({
  gallery,
  current,
  onNavigate,
  onClose,
}: {
  gallery: Gallery;
  current: AttachmentPreview;
  onNavigate: (offset: number) => void;
  onClose: () => void;
}) {
  if (!isPreviewableImageType(current.mimeType))
    return <DocumentPreviewDialogContent key={current.url} {...current} />;
  return (
    <ImageLightbox
      current={current}
      hasPrevious={gallery.index > 0}
      hasNext={gallery.index < gallery.items.length - 1}
      onNavigate={onNavigate}
      onClose={onClose}
    />
  );
}

function ImageLightbox({
  current,
  hasPrevious,
  hasNext,
  onNavigate,
  onClose,
}: {
  current: AttachmentPreview;
  hasPrevious: boolean;
  hasNext: boolean;
  onNavigate: (offset: number) => void;
  onClose: () => void;
}) {
  const { t } = useLingui();

  return (
    <DialogContent
      unstyled
      hideCloseButton
      hideOverlay
      className="fixed inset-0 z-50 flex flex-col bg-black/90 text-white outline-none backdrop-blur-sm duration-150 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" && hasPrevious) onNavigate(-1);
        else if (event.key === "ArrowRight" && hasNext) onNavigate(1);
        else return;
        event.preventDefault();
      }}
    >
      <DialogDescription className="sr-only">
        <Trans>Attachment preview</Trans>
      </DialogDescription>
      <LightboxFrame key={current.url} {...current} onClose={onClose} />
      {hasPrevious ? (
        <LightboxArrow
          side="left"
          label={t`Previous image`}
          onClick={() => onNavigate(-1)}
        />
      ) : null}
      {hasNext ? (
        <LightboxArrow
          side="right"
          label={t`Next image`}
          onClick={() => onNavigate(1)}
        />
      ) : null}
    </DialogContent>
  );
}

function LightboxFrame({
  onClose,
  ...attachment
}: AttachmentPreview & { onClose: () => void }) {
  const { t } = useLingui();
  const { file, preview, error } = useAttachmentPreviewFile(attachment);

  return (
    <>
      <div className="relative z-10 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3">
        <div>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            className="text-white hover:bg-white/10 hover:text-white"
            disabled={!file}
            onClick={() => file && saveBlob(file, attachment.filename)}
          >
            <DownloadIcon className="mr-2 size-4" aria-hidden="true" />
            <Trans>Download</Trans>
          </Button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 rounded bg-white px-1.5 py-0.5 font-semibold text-[10px] text-black tracking-wide">
            {getAttachmentFileType(attachment).label}
          </span>
          <DialogTitle className="truncate font-medium text-sm">
            {attachment.filename}
          </DialogTitle>
        </div>
        <div className="flex justify-end">
          <DialogClose asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              className="text-white hover:bg-white/10 hover:text-white"
              aria-label={t`Close`}
            >
              <XIcon className="size-5" aria-hidden="true" />
            </Button>
          </DialogClose>
        </div>
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Escape already closes the dialog */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center px-16 pb-8 text-sm text-white/70 sm:px-24"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <AttachmentPreviewBody
          filename={attachment.filename}
          preview={preview}
          error={error}
        />
      </div>
    </>
  );
}

function LightboxArrow({
  side,
  label,
  onClick,
}: {
  side: "left" | "right";
  label: string;
  onClick: () => void;
}) {
  const Icon = side === "left" ? ChevronLeftIcon : ChevronRightIcon;
  return (
    <button
      type="button"
      aria-label={label}
      className={cn(
        "absolute top-1/2 z-10 flex size-12 -translate-y-1/2 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        side === "left" ? "left-2 sm:left-4" : "right-2 sm:right-4",
      )}
      onClick={onClick}
    >
      <Icon className="size-8" strokeWidth={1.5} aria-hidden="true" />
    </button>
  );
}

function DocumentPreviewDialogContent(attachment: AttachmentPreview) {
  const { file, preview, error } = useAttachmentPreviewFile(attachment);

  return (
    <DialogContent className="flex h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
      <div className="flex items-center gap-3 border-b py-3 pr-12 pl-4">
        <DialogTitle className="min-w-0 flex-1 truncate font-medium text-sm">
          {attachment.filename}
        </DialogTitle>
        <DialogDescription className="sr-only">
          <Trans>Attachment preview</Trans>
        </DialogDescription>
        <Button
          variant="outline"
          size="sm"
          type="button"
          disabled={!file}
          onClick={() => file && saveBlob(file, attachment.filename)}
        >
          <DownloadIcon className="mr-2 size-4" aria-hidden="true" />
          <Trans>Download</Trans>
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted/40 text-muted-foreground text-sm">
        <AttachmentPreviewBody
          filename={attachment.filename}
          preview={preview}
          error={error}
        />
      </div>
    </DialogContent>
  );
}

// Branches on the type detected from the bytes, since senders mislabel files.
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
      <p>
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
  if (!preview) return <Loader2 className="size-6 animate-spin" />;
  if (preview.type === "application/pdf")
    return (
      <iframe
        title={filename}
        src={preview.url}
        className="size-full border-0 bg-white"
      />
    );
  return (
    <Image
      unoptimized
      width={0}
      height={0}
      alt={filename}
      className="size-auto max-h-full max-w-full object-contain"
      sizes="100vw"
      src={preview.url}
    />
  );
}

function useAttachmentPreviewFile({
  url,
  emailAccountId,
  size,
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

  return { file, preview, error };
}
