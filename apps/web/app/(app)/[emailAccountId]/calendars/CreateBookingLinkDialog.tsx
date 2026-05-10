"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { normalizeBookingSlug } from "@/utils/booking/slug";
import type { BookingLinkCalendarData } from "./BookingLinkFormFields";
import {
  BookingLinkGeneralFields,
  getProviderVideoLocationType,
  getSelectedCalendarProvider,
} from "./BookingLinkFormFields";

export function CreateBookingLinkDialog({
  data,
  defaultTitle,
  defaultSlug,
  onClose,
  onCreate,
  isCreating,
}: {
  data: BookingLinkCalendarData | undefined;
  defaultTitle: string;
  defaultSlug: string;
  onClose: () => void;
  onCreate: (values: {
    title: string;
    slug: string;
    durationMinutes: number;
    destinationCalendarId: string | null;
    videoEnabled: boolean;
    description: string;
  }) => Promise<void>;
  isCreating: boolean;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [slug, setSlug] = useState(defaultSlug);
  const [duration, setDuration] = useState(30);
  const [destinationCalendarId, setDestinationCalendarId] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [description, setDescription] = useState("");

  const selectedCalendarProvider = getSelectedCalendarProvider(
    data,
    destinationCalendarId,
  );
  const canAddVideo = Boolean(
    getProviderVideoLocationType(selectedCalendarProvider),
  );
  const normalizedSlug = normalizeBookingSlug(slug);
  const publicUrlPrefix =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/^https?:\/\//, "")}/book/`
      : "/book/";

  const handleCreate = async () => {
    await onCreate({
      title: title.trim(),
      slug: normalizedSlug,
      durationMinutes: duration,
      destinationCalendarId: destinationCalendarId || null,
      videoEnabled: canAddVideo && videoEnabled,
      description,
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="grid max-w-xl grid-rows-[auto_1fr_auto] gap-0 p-0 sm:rounded-2xl"
        hideCloseButton
      >
        <div className="flex items-start justify-between gap-3 border-b px-6 pb-4 pt-5">
          <div>
            <DialogTitle className="text-xl font-medium">
              Create booking link
            </DialogTitle>
            <DialogDescription className="mt-1 font-mono text-xs">
              {publicUrlPrefix}
              {normalizedSlug}
            </DialogDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <BookingLinkGeneralFields
          data={data}
          title={title}
          onTitleChange={setTitle}
          slug={slug}
          onSlugChange={(value) => setSlug(normalizeBookingSlug(value))}
          slugPlaceholder="your-name"
          publicUrlPrefix={publicUrlPrefix}
          duration={duration}
          onDurationChange={setDuration}
          destinationCalendarId={destinationCalendarId}
          onDestinationCalendarIdChange={setDestinationCalendarId}
          videoEnabled={videoEnabled}
          onVideoEnabledChange={setVideoEnabled}
          description={description}
          onDescriptionChange={setDescription}
        />

        <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreate}
            loading={isCreating}
            disabled={!title.trim() || normalizedSlug.length < 3}
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
