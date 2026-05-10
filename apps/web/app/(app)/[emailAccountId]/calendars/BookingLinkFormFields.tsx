"use client";

import type { ReactNode } from "react";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { cn } from "@/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export type BookingLinkCalendarData = {
  calendarConnections: Array<{
    provider: string;
    calendars: Array<{
      id: string;
      isEnabled: boolean;
      name: string;
      primary: boolean;
    }>;
  }>;
};

export const DURATION_OPTIONS = [15, 30, 45, 60];

const PRIMARY_CALENDAR_SELECT_VALUE = "__primary_calendar__";

export function BookingLinkGeneralFields({
  data,
  title,
  onTitleChange,
  slug,
  onSlugChange,
  slugPlaceholder,
  publicUrlPrefix,
  duration,
  onDurationChange,
  destinationCalendarId,
  onDestinationCalendarIdChange,
  videoEnabled,
  onVideoEnabledChange,
  description,
  onDescriptionChange,
}: {
  data: BookingLinkCalendarData | undefined;
  title: string;
  onTitleChange: (value: string) => void;
  slug: string;
  onSlugChange: (value: string) => void;
  slugPlaceholder: string;
  publicUrlPrefix: string;
  duration: number;
  onDurationChange: (value: number) => void;
  destinationCalendarId: string;
  onDestinationCalendarIdChange: (value: string) => void;
  videoEnabled: boolean;
  onVideoEnabledChange: (value: boolean) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
}) {
  const calendarOptions = getCalendarOptions(data);
  const selectedCalendarProvider = getSelectedCalendarProvider(
    data,
    destinationCalendarId,
  );
  const videoLocationType = getProviderVideoLocationType(
    selectedCalendarProvider,
  );
  const videoLabel = getVideoLocationLabel(videoLocationType);
  const canAddVideo = Boolean(videoLocationType);

  return (
    <div className="space-y-5 px-6 py-5">
      <div>
        <FieldLabel>What guests see</FieldLabel>
        <TextField
          name="title"
          value={title}
          onChange={onTitleChange}
          placeholder="15 min intro"
        />
      </div>

      <div>
        <FieldLabel>Link URL</FieldLabel>
        <div className="flex rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          <span className="min-w-0 shrink truncate border-r px-3 py-2 text-sm text-muted-foreground">
            {publicUrlPrefix}
          </span>
          <input
            type="text"
            name="slug"
            value={slug}
            onChange={(event) => onSlugChange(event.target.value)}
            placeholder={slugPlaceholder}
            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Duration</FieldLabel>
        <ChipGroup
          options={DURATION_OPTIONS.map((value) => ({
            label: `${value} min`,
            value,
          }))}
          value={duration}
          onChange={onDurationChange}
        />
      </div>

      <div>
        <FieldLabel>Add events to</FieldLabel>
        <Select
          name="destinationCalendarId"
          value={destinationCalendarId || PRIMARY_CALENDAR_SELECT_VALUE}
          onValueChange={(value) =>
            onDestinationCalendarIdChange(
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

      <div className="flex items-center justify-between gap-4 rounded-lg border px-3.5 py-3">
        <div>
          <div className="text-sm font-medium text-foreground">
            Video conferencing
          </div>
          <p className="text-xs text-muted-foreground">
            {videoLabel
              ? `Add ${videoLabel} to calendar events.`
              : "Video links are unavailable for this calendar."}
          </p>
        </div>
        <Switch
          checked={canAddVideo && videoEnabled}
          disabled={!canAddVideo}
          onCheckedChange={onVideoEnabledChange}
          aria-label="Toggle video conferencing"
        />
      </div>

      <div>
        <FieldLabel>Description (optional)</FieldLabel>
        <textarea
          name="description"
          value={description}
          onChange={(event) => onDescriptionChange(event.target.value)}
          placeholder="Tell guests what to expect."
          rows={3}
          className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
    </div>
  );
}

export function getSelectedCalendarProvider(
  data: BookingLinkCalendarData | undefined,
  destinationCalendarId: string,
) {
  const calendars =
    data?.calendarConnections.flatMap((connection) =>
      connection.calendars.map((calendar) => ({
        id: calendar.id,
        isEnabled: calendar.isEnabled,
        primary: calendar.primary,
        provider: connection.provider,
      })),
    ) ?? [];

  if (destinationCalendarId) {
    return (
      calendars.find((calendar) => calendar.id === destinationCalendarId)
        ?.provider ?? null
    );
  }

  return (
    calendars.find((calendar) => calendar.isEnabled && calendar.primary)
      ?.provider ??
    calendars.find((calendar) => calendar.isEnabled)?.provider ??
    null
  );
}

export function getProviderVideoLocationType(
  provider: string | null | undefined,
) {
  if (isGoogleProvider(provider)) {
    return BookingLinkLocationType.GOOGLE_MEET;
  }
  if (isMicrosoftProvider(provider)) {
    return BookingLinkLocationType.MICROSOFT_TEAMS;
  }
  return null;
}

export function isProviderVideoLocationType(
  locationType: BookingLinkLocationType,
) {
  return (
    locationType === BookingLinkLocationType.GOOGLE_MEET ||
    locationType === BookingLinkLocationType.MICROSOFT_TEAMS
  );
}

function ChipGroup<T extends number | string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ label: string; value: T }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "flex-1 rounded-md border px-3 py-2 text-center text-sm transition-colors",
              active
                ? "border-blue-600 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-300"
                : "border-input bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function TextField({
  name,
  value,
  onChange,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      type="text"
      name={name}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function getVideoLocationLabel(locationType: BookingLinkLocationType | null) {
  if (locationType === BookingLinkLocationType.GOOGLE_MEET) {
    return "Google Meet";
  }
  if (locationType === BookingLinkLocationType.MICROSOFT_TEAMS) {
    return "Microsoft Teams";
  }
  return null;
}

function getCalendarOptions(data: BookingLinkCalendarData | undefined) {
  const calendars =
    data?.calendarConnections.flatMap((connection) =>
      connection.calendars.map((calendar) => ({
        label: `${calendar.name}${calendar.primary ? " (Primary)" : ""}`,
        value: calendar.id,
      })),
    ) ?? [];

  return [{ label: "Primary calendar", value: "" }, ...calendars];
}
