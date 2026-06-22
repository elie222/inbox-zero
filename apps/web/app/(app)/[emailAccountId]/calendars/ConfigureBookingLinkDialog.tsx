"use client";

import { useState, type ChangeEvent } from "react";
import { Trash2, X } from "lucide-react";
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
import { toastError, toastSuccess } from "@/components/Toast";
import { useBookingLinks } from "@/hooks/useBookingLinks";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import {
  deleteBookingLinkAction,
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
type ConfigureBookingLinkTab = "general" | "advanced";

export function ConfigureBookingLinkDialog({
  link,
  onClose,
  onSaved,
}: {
  link: BookingLink;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<ConfigureBookingLinkTab>("general");

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
              active={tab === "advanced"}
              onClick={() => setTab("advanced")}
            >
              Advanced
            </TabButton>
          </div>
        </div>

        {tab === "general" && <GeneralTab link={link} onSaved={onSaved} />}
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
  const [minimumNoticeHours, setMinimumNoticeHours] = useState(() =>
    formatHours(link.minimumNoticeMinutes / 60),
  );
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
    const minimumNoticeMinutes = parseMinimumNoticeHours(minimumNoticeHours);
    if (minimumNoticeMinutes === null) {
      toastError({
        description: "Minimum notice must be 0 hours or more.",
      });
      return;
    }

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
        minimumNoticeMinutes,
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

function parseMinimumNoticeHours(value: string) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 0 || hours > 365 * 24) return null;
  return Math.round(hours * 60);
}

function formatHours(value: number) {
  return Number.isInteger(value) ? String(value) : String(value.toFixed(2));
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
