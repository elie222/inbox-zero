"use client";

import { useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeBookingSlug } from "@/utils/booking/slug";
import { cn } from "@/utils";
import { VideoConferencingItem } from "./VideoConferencingItem";
import {
  DURATION_OPTIONS,
  getCalendarOptions,
  getDefaultDestinationCalendarId,
  getProviderVideoLocationType,
  getSelectedCalendarProvider,
  getVideoLocationLabel,
  type BookingLinkCalendarData,
} from "./booking-calendar-helpers";

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
  const defaultDestinationCalendarId = getDefaultDestinationCalendarId(data);
  const [selectedDestinationCalendarId, setSelectedDestinationCalendarId] =
    useState<string | null>(null);
  const destinationCalendarId =
    selectedDestinationCalendarId ?? defaultDestinationCalendarId;
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [description, setDescription] = useState("");

  const selectedCalendarProvider = getSelectedCalendarProvider(
    data,
    destinationCalendarId,
  );
  const videoLocationType = getProviderVideoLocationType(
    selectedCalendarProvider,
  );
  const videoLabel = getVideoLocationLabel(videoLocationType);
  const canAddVideo = Boolean(videoLocationType);
  const calendarOptions = getCalendarOptions(data);
  const hasConnectedCalendar = calendarOptions.length > 0;
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
      destinationCalendarId,
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

        {hasConnectedCalendar ? (
          <>
            <div className="space-y-5 px-6 py-5">
              <Input
                type="text"
                name="title"
                label="What guests see"
                placeholder="15 min intro"
                registerProps={{
                  value: title,
                  onChange: (event: ChangeEvent<HTMLInputElement>) =>
                    setTitle(event.target.value),
                }}
              />

              <Input
                type="text"
                name="slug"
                label="Link URL"
                leftText={publicUrlPrefix}
                placeholder="your-name"
                registerProps={{
                  value: slug,
                  onChange: (event: ChangeEvent<HTMLInputElement>) =>
                    setSlug(normalizeBookingSlug(event.target.value)),
                }}
              />

              <div>
                <Label name="duration" label="Duration" />
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {DURATION_OPTIONS.map((option) => {
                    const active = option === duration;
                    return (
                      <Button
                        key={option}
                        type="button"
                        variant="outline"
                        onClick={() => setDuration(option)}
                        className={cn(
                          "w-full",
                          active && "border-primary ring-1 ring-primary",
                        )}
                      >
                        {option} min
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label name="destinationCalendarId" label="Add events to" />
                <Select
                  name="destinationCalendarId"
                  value={destinationCalendarId}
                  onValueChange={(value) =>
                    setSelectedDestinationCalendarId(value)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {calendarOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <VideoConferencingItem
                canAddVideo={canAddVideo}
                videoEnabled={videoEnabled}
                videoLabel={videoLabel}
                onChange={setVideoEnabled}
              />

              <Input
                type="text"
                autosizeTextarea
                rows={3}
                name="description"
                label="Description (optional)"
                placeholder="Tell guests what to expect."
                registerProps={{
                  value: description,
                  onChange: (event: ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(event.target.value),
                }}
              />
            </div>

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
          </>
        ) : (
          <>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground">
                Connect your calendar to create a booking link.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
