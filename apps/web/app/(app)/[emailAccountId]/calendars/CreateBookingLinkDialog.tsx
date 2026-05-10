"use client";

import { useState, type ChangeEvent } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/Input";
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
  getProviderVideoLocationType,
  getSelectedCalendarProvider,
  getVideoLocationLabel,
  PRIMARY_CALENDAR_SELECT_VALUE,
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
  const [destinationCalendarId, setDestinationCalendarId] = useState("");
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [description, setDescription] = useState("");
  const hasConnectedCalendar = Boolean(
    data?.calendarConnections.some((connection) => connection.calendars.length),
  );

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
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Duration
                </div>
                <div className="flex gap-1.5">
                  {DURATION_OPTIONS.map((option) => {
                    const active = option === duration;
                    return (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setDuration(option)}
                        className={cn(
                          "flex-1 rounded-md border px-3 py-2 text-center text-sm transition-colors",
                          active
                            ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300"
                            : "border-input bg-background text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {option} min
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                  Add events to
                </div>
                <Select
                  name="destinationCalendarId"
                  value={destinationCalendarId || PRIMARY_CALENDAR_SELECT_VALUE}
                  onValueChange={(value) =>
                    setDestinationCalendarId(
                      value === PRIMARY_CALENDAR_SELECT_VALUE ? "" : value,
                    )
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {calendarOptions.map((option) => (
                      <SelectItem
                        key={option.value || PRIMARY_CALENDAR_SELECT_VALUE}
                        value={option.value || PRIMARY_CALENDAR_SELECT_VALUE}
                      >
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
