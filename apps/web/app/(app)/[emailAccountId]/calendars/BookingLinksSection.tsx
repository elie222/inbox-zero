"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  Copy,
  ExternalLink,
  Link2,
  Settings2,
  X,
  Zap,
} from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { CardBasic } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import { Input } from "@/components/Input";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/Toast";
import { useBookingLinksEnabled } from "@/hooks/useFeatureFlags";
import { useBookingLinks } from "@/hooks/useBookingLinks";
import { useCalendars } from "@/hooks/useCalendars";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useAccount } from "@/providers/EmailAccountProvider";
import { getActionErrorMessage } from "@/utils/error";
import {
  createBookingLinkAction,
  updateBookingLinkAction,
} from "@/utils/actions/booking";
import { updateCalendarBookingLinkAction } from "@/utils/actions/calendar";
import { updateBookingLinkBody } from "@/utils/actions/calendar.validation";
import {
  getBookingLinkSlugSuggestion,
  normalizeBookingSlug,
} from "@/utils/booking/slug";
import { BookingEventTypeLocationType } from "@/generated/prisma/enums";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";
import { cn } from "@/utils";
import { ConfigureBookingLinkDialog } from "./ConfigureBookingLinkDialog";

type BookingLink = NonNullable<
  ReturnType<typeof useBookingLinks>["data"]
>["bookingLinks"][number];
type BookingLinksData = NonNullable<ReturnType<typeof useBookingLinks>["data"]>;

const DURATION_OPTIONS = [15, 30, 45, 60];
const PRIMARY_CALENDAR_SELECT_VALUE = "__primary_calendar__";

export function BookingLinksSection() {
  const bookingLinksEnabled = useBookingLinksEnabled();

  if (!bookingLinksEnabled) return null;

  return <BookingLinksPanel />;
}

function BookingLinksPanel() {
  const { emailAccountId, emailAccount } = useAccount();
  const { data, isLoading, error, mutate } = useBookingLinks();
  const [configureLinkId, setConfigureLinkId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const link = data?.bookingLinks[0] ?? null;
  const timezone =
    data?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const defaultName = emailAccount?.name?.trim() || null;
  const defaultTitle = defaultName
    ? `${defaultName}'s booking link`
    : "Booking link";
  const defaultSlug = getBookingLinkSlugSuggestion(defaultName);

  const { executeAsync: createLink, isExecuting: isCreating } = useAction(
    createBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Booking link created" });
        mutate();
        setCreateOpen(false);
      },
      onError: (actionError) => {
        toastError({
          description:
            getActionErrorMessage(actionError.error) ??
            "Failed to create booking link",
        });
      },
    },
  );

  const { execute: toggleActive, isExecuting: isToggling } = useAction(
    updateBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => mutate(),
      onError: (actionError) => {
        toastError({
          description:
            getActionErrorMessage(actionError.error) ??
            "Failed to update booking link",
        });
      },
    },
  );

  const handleCreate = async ({
    title,
    slug,
    durationMinutes,
    destinationCalendarId,
    videoEnabled,
    description,
  }: {
    title: string;
    slug: string;
    durationMinutes: number;
    destinationCalendarId: string | null;
    videoEnabled: boolean;
    description: string;
  }) => {
    await createLink({
      title,
      slug,
      timezone,
      description,
      durationMinutes,
      slotIntervalMinutes: durationMinutes,
      destinationCalendarId,
      videoEnabled,
    });
  };

  const handleToggle = (next: boolean) => {
    if (!link) return;
    toggleActive({ id: link.id, isActive: next });
  };

  return (
    <section className="space-y-3">
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-32 w-full rounded-xl" />}
      >
        {link ? (
          <ActiveLinkCard
            link={link}
            isToggling={isToggling}
            onToggle={handleToggle}
            onConfigure={() => setConfigureLinkId(link.id)}
          />
        ) : (
          <EmptyLinkCard onCreate={() => setCreateOpen(true)} />
        )}
      </LoadingContent>

      <ExternalBookingLinkCard />

      {createOpen ? (
        <CreateBookingLinkDialog
          key={defaultSlug}
          data={data}
          defaultTitle={defaultTitle}
          defaultSlug={defaultSlug}
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
          isCreating={isCreating}
        />
      ) : null}

      {link && configureLinkId === link.id ? (
        <ConfigureBookingLinkDialog
          link={link}
          onClose={() => setConfigureLinkId(null)}
          onSaved={() => {
            mutate();
            setConfigureLinkId(null);
          }}
        />
      ) : null}
    </section>
  );
}

function ExternalBookingLinkCard() {
  const { emailAccountId } = useAccount();
  const analytics = useProductAnalytics("calendars");
  const { data, isLoading, error, mutate } = useCalendars();
  const calendarBookingLink = data?.calendarBookingLink || null;

  const [userToggled, setUserToggled] = useState<boolean | null>(null);
  const isOpen = userToggled ?? Boolean(calendarBookingLink);

  const { execute, isExecuting } = useAction(
    updateCalendarBookingLinkAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        analytics.captureAction("calendar_booking_link_saved", {
          had_existing_booking_link: Boolean(calendarBookingLink),
        });
        toastSuccess({ description: "Booking link updated!" });
        mutate();
      },
    },
  );

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.infer<typeof updateBookingLinkBody>>({
    resolver: zodResolver(updateBookingLinkBody),
    defaultValues: { bookingLink: calendarBookingLink || "" },
  });

  useEffect(() => {
    if (calendarBookingLink !== null || data) {
      reset({ bookingLink: calendarBookingLink || "" });
    }
  }, [calendarBookingLink, reset, data]);

  const onSubmit: SubmitHandler<z.infer<typeof updateBookingLinkBody>> = (
    formData,
  ) => {
    analytics.captureAction("calendar_booking_link_save_started", {
      has_booking_link: Boolean(formData.bookingLink),
    });
    execute(formData);
  };

  return (
    <CardBasic className="px-4 py-3">
      <button
        type="button"
        onClick={() => setUserToggled(!isOpen)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm text-muted-foreground hover:text-foreground"
        aria-expanded={isOpen}
      >
        <span>Use your own scheduling link (Cal.com, Calendly, etc.)</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 transition-transform",
            isOpen && "rotate-180",
          )}
        />
      </button>
      {isOpen ? (
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="mt-3 h-10 w-full" />}
        >
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start"
          >
            <div className="flex-1">
              <Input
                type="url"
                name="bookingLink"
                placeholder="https://cal.com/your-link"
                registerProps={register("bookingLink")}
                error={errors.bookingLink}
              />
            </div>
            <Button
              type="submit"
              loading={isExecuting}
              size="sm"
              className="w-full sm:w-auto"
            >
              Save
            </Button>
          </form>
        </LoadingContent>
      ) : null}
    </CardBasic>
  );
}

function EmptyLinkCard({ onCreate }: { onCreate: () => void }) {
  return (
    <CardBasic className="px-4 py-4">
      <div className="mb-1 flex items-center gap-2">
        <h3 className="font-medium">Booking link</h3>
        <span className="rounded-md border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-600 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400">
          New
        </span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Create a link people can use to book time on your calendar.
      </p>
      <Button onClick={onCreate} Icon={Zap}>
        Create booking link
      </Button>
    </CardBasic>
  );
}

function CreateBookingLinkDialog({
  data,
  defaultTitle,
  defaultSlug,
  onClose,
  onCreate,
  isCreating,
}: {
  data: BookingLinksData | undefined;
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

  const calendarOptions = useMemo(() => {
    const calendars =
      data?.calendarConnections.flatMap((connection) =>
        connection.calendars.map((calendar) => ({
          label: `${calendar.name}${calendar.primary ? " (Primary)" : ""}`,
          value: calendar.id,
        })),
      ) ?? [];
    return [{ label: "Primary calendar", value: "" }, ...calendars];
  }, [data?.calendarConnections]);

  const selectedCalendarProvider = useMemo(
    () => getSelectedCalendarProvider(data, destinationCalendarId),
    [data, destinationCalendarId],
  );
  const videoLocationType = getProviderVideoLocationType(
    selectedCalendarProvider,
  );
  const videoLabel = getVideoLocationLabel(videoLocationType);
  const canAddVideo = Boolean(videoLocationType);
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

        <div className="space-y-5 px-6 py-5">
          <div>
            <Label>What guests see</Label>
            <TextField
              name="title"
              value={title}
              onChange={setTitle}
              placeholder="15 min intro"
            />
          </div>

          <div>
            <Label>Link URL</Label>
            <div className="flex rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <span className="min-w-0 shrink truncate border-r px-3 py-2 text-sm text-muted-foreground">
                {publicUrlPrefix}
              </span>
              <input
                type="text"
                name="slug"
                value={slug}
                onChange={(event) =>
                  setSlug(normalizeBookingSlug(event.target.value))
                }
                placeholder="your-name"
                className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground outline-none focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              />
            </div>
          </div>

          <div>
            <Label>Duration</Label>
            <ChipGroup
              options={DURATION_OPTIONS.map((value) => ({
                label: `${value} min`,
                value,
              }))}
              value={duration}
              onChange={setDuration}
            />
          </div>

          <div>
            <Label>Add events to</Label>
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
              onCheckedChange={setVideoEnabled}
              aria-label="Toggle video conferencing"
            />
          </div>

          <div>
            <Label>Description (optional)</Label>
            <textarea
              name="description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Tell guests what to expect."
              rows={3}
              className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
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
      </DialogContent>
    </Dialog>
  );
}

function ActiveLinkCard({
  link,
  isToggling,
  onToggle,
  onConfigure,
}: {
  link: BookingLink;
  isToggling: boolean;
  onToggle: (next: boolean) => void;
  onConfigure: () => void;
}) {
  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/book/${link.slug}`
      : `/book/${link.slug}`;
  const displayUrl = stripScheme(publicUrl);
  const isActive = link.isActive;

  const handleCopy = () => {
    navigator.clipboard.writeText(publicUrl);
    toastSuccess({ description: "Booking link copied" });
  };

  return (
    <CardBasic className="px-4 py-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Booking link</h3>
          {!isActive ? (
            <span className="inline-flex items-center gap-1 rounded-md border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-muted-foreground/60" />
              Inactive
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={isActive}
            disabled={isToggling}
            onCheckedChange={onToggle}
            size="sm"
            aria-label="Toggle booking link"
          />
          <Button
            variant="outline"
            size="sm"
            Icon={Settings2}
            onClick={onConfigure}
          >
            Configure
          </Button>
        </div>
      </div>

      <div
        className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
          isActive
            ? "bg-muted/40"
            : "border-dashed bg-muted/30 text-muted-foreground"
        }`}
      >
        <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
        <span
          className={`flex-1 truncate font-mono text-xs ${
            isActive ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {displayUrl}
        </span>
        {isActive ? (
          <>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label="Copy booking link"
              title="Copy booking link"
            >
              <Copy className="size-4" />
            </button>
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              aria-label="Open booking link"
              title="Open booking link"
            >
              <ExternalLink className="size-4" />
            </a>
          </>
        ) : (
          <span className="text-[11px] text-muted-foreground">not live</span>
        )}
      </div>
    </CardBasic>
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

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function getSelectedCalendarProvider(
  data: BookingLinksData | undefined,
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

function getProviderVideoLocationType(provider: string | null | undefined) {
  if (isGoogleProvider(provider)) {
    return BookingEventTypeLocationType.GOOGLE_MEET;
  }
  if (isMicrosoftProvider(provider)) {
    return BookingEventTypeLocationType.MICROSOFT_TEAMS;
  }
  return null;
}

function getVideoLocationLabel(
  locationType: BookingEventTypeLocationType | null,
) {
  if (locationType === BookingEventTypeLocationType.GOOGLE_MEET) {
    return "Google Meet";
  }
  if (locationType === BookingEventTypeLocationType.MICROSOFT_TEAMS) {
    return "Microsoft Teams";
  }
  return null;
}

function stripScheme(url: string) {
  return url.replace(/^https?:\/\//, "");
}
