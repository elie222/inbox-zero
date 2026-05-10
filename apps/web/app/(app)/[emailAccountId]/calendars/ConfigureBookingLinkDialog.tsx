"use client";

import { useMemo, useState, type ChangeEvent } from "react";
import { Copy, Info, Plus, Trash2, X } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { Input, Label } from "@/components/Input";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toastError, toastSuccess } from "@/components/Toast";
import { useBookingLinks } from "@/hooks/useBookingLinks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import {
  deleteBookingLinkAction,
  updateBookingAvailabilityAction,
  updateBookingLinkAction,
} from "@/utils/actions/booking";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { cn } from "@/utils";
import { normalizeBookingSlug } from "@/utils/booking/slug";
import {
  DURATION_OPTIONS,
  getCalendarOptions,
  getDefaultDestinationCalendarId,
  getProviderVideoLocationType,
  getSelectedCalendarProvider,
  getVideoLocationLabel,
  isProviderVideoLocationType,
} from "./booking-calendar-helpers";
import { VideoConferencingItem } from "./VideoConferencingItem";

type BookingLink = NonNullable<
  ReturnType<typeof useBookingLinks>["data"]
>["bookingLinks"][number];
export type ConfigureBookingLinkTab = "general" | "availability" | "advanced";

type Range = { start: string; end: string };
type DayState = { enabled: boolean; ranges: Range[] };

const DAY_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export function ConfigureBookingLinkDialog({
  link,
  initialTab = "general",
  onClose,
  onSaved,
}: {
  link: BookingLink;
  initialTab?: ConfigureBookingLinkTab;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<ConfigureBookingLinkTab>(initialTab);

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/^https?:\/\//, "")}/book/${link.slug}`
      : `/book/${link.slug}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="grid max-w-xl grid-rows-[auto_auto_1fr_auto] gap-0 p-0 sm:rounded-2xl"
        hideCloseButton
      >
        <div className="flex items-start justify-between gap-3 border-b px-6 pb-4 pt-5">
          <div>
            <DialogTitle className="text-xl font-medium">
              Configure booking link
            </DialogTitle>
            <DialogDescription className="mt-1 font-mono text-xs">
              {publicUrl}
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

        <div className="border-b px-6">
          <div className="flex gap-2">
            <TabButton
              active={tab === "general"}
              onClick={() => setTab("general")}
            >
              General
            </TabButton>
            <TabButton
              active={tab === "availability"}
              onClick={() => setTab("availability")}
            >
              Availability
            </TabButton>
            <TabButton
              active={tab === "advanced"}
              onClick={() => setTab("advanced")}
            >
              Advanced
            </TabButton>
          </div>
        </div>

        {tab === "general" && <GeneralTab link={link} onSaved={onSaved} />}
        {tab === "availability" && (
          <AvailabilityTab link={link} onSaved={onSaved} />
        )}
        {tab === "advanced" && <AdvancedTab link={link} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-3 py-3 text-sm font-medium transition-colors",
        active
          ? "border-blue-600 text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function GeneralTab({
  link,
  onSaved,
}: {
  link: BookingLink;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { data } = useBookingLinks();

  const [title, setTitle] = useState(link.title);
  const [slug, setSlug] = useState(link.slug);
  const [duration, setDuration] = useState<number>(link.durationMinutes);
  const defaultDestinationCalendarId = getDefaultDestinationCalendarId(data);
  const [destinationCalendarId, setDestinationCalendarId] = useState<string>(
    link.destinationCalendarId ?? defaultDestinationCalendarId,
  );
  const [videoEnabled, setVideoEnabled] = useState(() =>
    isProviderVideoLocationType(link.locationType),
  );
  const [description, setDescription] = useState<string>(
    link.description ?? "",
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

  const { executeAsync: updateLink, isExecuting: isSaving } = useAction(
    updateBookingLinkAction.bind(null, emailAccountId),
    {
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ??
            "Failed to update booking link",
        });
      },
    },
  );

  const publicUrlPrefix =
    typeof window !== "undefined"
      ? `${window.location.origin.replace(/^https?:\/\//, "")}/book/`
      : "/book/";

  const handleSave = async () => {
    try {
      const nextLocationType =
        videoEnabled && videoLocationType
          ? videoLocationType
          : isProviderVideoLocationType(link.locationType)
            ? BookingLinkLocationType.CUSTOM
            : link.locationType;
      const nextLocationValue = isProviderVideoLocationType(nextLocationType)
        ? null
        : link.locationValue;

      const result = await updateLink({
        id: link.id,
        slug,
        title,
        description,
        durationMinutes: duration,
        slotIntervalMinutes: duration,
        locationType: nextLocationType,
        locationValue: nextLocationValue,
        destinationCalendarId,
      });
      if (hasActionResultError(result)) return;

      toastSuccess({ description: "Booking link updated" });
      onSaved();
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : "Failed to update booking link",
      });
    }
  };

  return (
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
          placeholder="elie"
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
            onValueChange={setDestinationCalendarId}
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

      <DialogFooter onSaved={onSaved} onSave={handleSave} loading={isSaving} />
    </>
  );
}

function AvailabilityTab({
  link,
  onSaved,
}: {
  link: BookingLink;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();

  const initialDays = useMemo(
    () => buildDayState(link.windows ?? []),
    [link.windows],
  );
  const [days, setDays] = useState<DayState[]>(initialDays);
  const timezone =
    link.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(() =>
    formatHours(link.minimumNoticeMinutes / 60),
  );

  const {
    executeAsync: updateAvailability,
    isExecuting: isUpdatingAvailability,
  } = useAction(updateBookingAvailabilityAction.bind(null, emailAccountId), {
    onError: (error) => {
      toastError({
        description:
          getActionErrorMessage(error.error) ?? "Failed to update availability",
      });
    },
  });

  const isSaving = isUpdatingAvailability;

  const updateDay = (index: number, next: Partial<DayState>) => {
    setDays((prev) =>
      prev.map((day, dayIndex) =>
        dayIndex === index ? { ...day, ...next } : day,
      ),
    );
  };

  const addRange = (dayIndex: number) => {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              ranges: [
                ...day.ranges,
                nextRangeAfter(day.ranges[day.ranges.length - 1]),
              ],
            }
          : day,
      ),
    );
  };

  const removeRange = (dayIndex: number, rangeIndex: number) => {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              ranges: day.ranges.filter((_, i) => i !== rangeIndex),
            }
          : day,
      ),
    );
  };

  const updateRange = (
    dayIndex: number,
    rangeIndex: number,
    next: Partial<Range>,
  ) => {
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? {
              ...day,
              ranges: day.ranges.map((range, i) =>
                i === rangeIndex ? { ...range, ...next } : range,
              ),
            }
          : day,
      ),
    );
  };

  const copyDayToOthers = (dayIndex: number) => {
    const source = days[dayIndex];
    setDays((prev) =>
      prev.map((day, index) =>
        index === dayIndex
          ? day
          : {
              enabled: source.enabled,
              ranges: source.ranges.map((range) => ({ ...range })),
            },
      ),
    );
  };

  const handleSave = async () => {
    const minimumNoticeMinutes = parseMinimumNoticeHours(minimumNoticeHours);
    if (minimumNoticeMinutes === null) {
      toastError({
        description: "Minimum notice must be 0 hours or more.",
      });
      return;
    }

    const windows: Array<{
      weekday: number;
      startMinutes: number;
      endMinutes: number;
    }> = [];
    for (let weekday = 0; weekday < 7; weekday++) {
      const day = days[weekday];
      if (!day.enabled) continue;
      for (const range of day.ranges) {
        const start = parseTime(range.start);
        const end = parseTime(range.end);
        if (start === null || end === null || end <= start) {
          toastError({
            description: `${DAY_LABELS[weekday]}: end time must be after start time.`,
          });
          return;
        }
        windows.push({ weekday, startMinutes: start, endMinutes: end });
      }
    }

    if (windows.length === 0) {
      toastError({
        description: "Add at least one available time range.",
      });
      return;
    }

    try {
      const result = await updateAvailability({
        bookingLinkId: link.id,
        minimumNoticeMinutes,
        timezone,
        windows,
      });
      if (hasActionResultError(result)) return;

      toastSuccess({ description: "Availability updated" });
      onSaved();
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : "Failed to update availability",
      });
    }
  };

  return (
    <>
      <div className="space-y-4 overflow-y-auto px-6 py-5">
        <div>
          <div className="text-sm font-semibold text-foreground">
            Weekly hours
          </div>
          <p className="text-xs text-muted-foreground">
            Hours shown in {timezone}. Change in Calendar settings.
          </p>
        </div>

        <div className="rounded-lg border bg-card">
          {DAY_LABELS.map((dayLabel, dayIndex) => {
            const day = days[dayIndex];
            return (
              <div
                key={dayLabel}
                className="flex items-start gap-4 border-b px-4 py-3 last:border-b-0"
              >
                <div className="flex w-32 items-center gap-2.5 pt-1.5">
                  <Switch
                    checked={day.enabled}
                    size="sm"
                    onCheckedChange={(next) =>
                      updateDay(dayIndex, {
                        enabled: next,
                        ranges:
                          next && day.ranges.length === 0
                            ? [{ start: "09:00", end: "17:00" }]
                            : day.ranges,
                      })
                    }
                    aria-label={`Toggle ${dayLabel}`}
                  />
                  <span
                    className={cn(
                      "text-sm",
                      day.enabled
                        ? "font-medium text-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {dayLabel}
                  </span>
                </div>
                <div className="flex flex-1 flex-col gap-2">
                  {day.enabled ? (
                    day.ranges.map((range, rangeIndex) => (
                      <div key={rangeIndex} className="flex items-center gap-2">
                        <TimeField
                          value={range.start}
                          onChange={(value) =>
                            updateRange(dayIndex, rangeIndex, { start: value })
                          }
                        />
                        <span className="text-sm text-muted-foreground">–</span>
                        <TimeField
                          value={range.end}
                          onChange={(value) =>
                            updateRange(dayIndex, rangeIndex, { end: value })
                          }
                        />
                        {rangeIndex === 0 ? (
                          <>
                            <IconButton
                              title="Add another range"
                              onClick={() => addRange(dayIndex)}
                            >
                              <Plus className="size-4" />
                            </IconButton>
                            <IconButton
                              title="Copy to other days"
                              onClick={() => copyDayToOthers(dayIndex)}
                            >
                              <Copy className="size-3.5" />
                            </IconButton>
                          </>
                        ) : (
                          <IconButton
                            title="Remove range"
                            onClick={() => removeRange(dayIndex, rangeIndex)}
                          >
                            <X className="size-3.5" />
                          </IconButton>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="flex h-8 items-center text-sm text-muted-foreground">
                      Unavailable
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-3 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0 text-muted-foreground" />
          We hide times where you already have events on your connected
          calendar.
        </div>

        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Minimum notice</ItemTitle>
            <ItemDescription>
              Block new bookings this many hours into the future.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Input
              type="number"
              name="minimumNoticeHours"
              min={0}
              max={365 * 24}
              step={0.25}
              rightText="hours"
              className="w-24 tabular-nums"
              registerProps={{
                value: minimumNoticeHours,
                onChange: (event: ChangeEvent<HTMLInputElement>) =>
                  setMinimumNoticeHours(event.target.value),
              }}
            />
          </ItemActions>
        </Item>
      </div>

      <DialogFooter onSaved={onSaved} onSave={handleSave} loading={isSaving} />
    </>
  );
}

function AdvancedTab({
  link,
  onSaved,
}: {
  link: BookingLink;
  onSaved: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { executeAsync: deleteLink, isExecuting: isDeleting } = useAction(
    deleteBookingLinkAction.bind(null, emailAccountId),
    {
      onError: (error) => {
        toastError({
          description:
            getActionErrorMessage(error.error) ??
            "Failed to delete booking link",
        });
      },
    },
  );

  const handleDelete = async () => {
    const confirmed = window.confirm(
      "Delete this booking link permanently? This cannot be undone.",
    );
    if (!confirmed) return;

    try {
      const result = await deleteLink({ id: link.id });
      if (hasActionResultError(result)) return;

      toastSuccess({ description: "Booking link deleted" });
      onSaved();
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : "Failed to delete booking link",
      });
    }
  };

  return (
    <>
      <div className="space-y-4 overflow-y-auto px-6 py-5">
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>Delete booking link</ItemTitle>
            <ItemDescription>
              Permanently remove this booking link and its booking history.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              variant="destructiveSoft"
              onClick={handleDelete}
              loading={isDeleting}
              Icon={Trash2}
            >
              Delete
            </Button>
          </ItemActions>
        </Item>
      </div>

      <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
        <Button variant="outline" onClick={onSaved}>
          Close
        </Button>
      </div>
    </>
  );
}
function DialogFooter({
  onSaved,
  onSave,
  loading,
}: {
  onSaved: () => void;
  onSave: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 border-t px-6 py-3">
      <Button variant="outline" onClick={onSaved}>
        Cancel
      </Button>
      <Button onClick={onSave} loading={loading}>
        Save
      </Button>
    </div>
  );
}

function TimeField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-[110px] rounded-md border border-input bg-background px-2.5 py-1.5 text-center text-sm tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function IconButton({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function buildDayState(
  windows: Array<{
    weekday: number;
    startMinutes: number;
    endMinutes: number;
  }>,
): DayState[] {
  const byDay = new Map<number, Range[]>();
  for (const window of windows) {
    const list = byDay.get(window.weekday) ?? [];
    list.push({
      start: minutesToTime(window.startMinutes),
      end: minutesToTime(window.endMinutes),
    });
    byDay.set(window.weekday, list);
  }
  return DAY_LABELS.map((_, weekday) => {
    const ranges = byDay.get(weekday) ?? [];
    return ranges.length
      ? { enabled: true, ranges }
      : { enabled: false, ranges: [] };
  });
}

function nextRangeAfter(previous?: Range): Range {
  if (!previous) return { start: "09:00", end: "17:00" };
  const previousEnd = parseTime(previous.end) ?? 17 * 60;
  const start = Math.min(previousEnd + 30, 23 * 60);
  const end = Math.min(start + 60, 24 * 60 - 1);
  return { start: minutesToTime(start), end: minutesToTime(end) };
}

function parseTime(value: string): number | null {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseMinimumNoticeHours(value: string) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 365 * 24) return null;
  return Math.round(hours * 60);
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : String(value.toFixed(2));
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function hasActionResultError(
  result:
    | {
        serverError?: string;
        validationErrors?: unknown;
      }
    | undefined,
) {
  return Boolean(result?.serverError || result?.validationErrors);
}
