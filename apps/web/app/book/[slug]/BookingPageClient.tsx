"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Calendar as CalendarIcon,
  Check,
  Clock,
  Globe,
  Info,
  MapPin,
  Phone,
  Video,
} from "lucide-react";
import type { GetPublicBookingLinkResponse } from "@/app/api/public/booking-links/[slug]/route";
import { BookingEventTypeLocationType } from "@/generated/prisma/enums";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";

type Slot = { endTime: string; startTime: string };
type EventType = GetPublicBookingLinkResponse["eventTypes"][number];
type SuccessState = {
  cancelUrl?: string;
  endTime: string;
  startTime: string;
};

type Step = "pick-time" | "details" | "success";

export function BookingPageClient({
  bookingLink,
  eventTypeSlug,
}: {
  bookingLink: GetPublicBookingLinkResponse;
  eventTypeSlug: string;
}) {
  const eventType = bookingLink.eventTypes.find(
    (candidate) => candidate.slug === eventTypeSlug,
  );

  const timezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    [],
  );

  const initialMonth = useMemo(() => startOfMonth(new Date()), []);
  const [visibleMonth, setVisibleMonth] = useState<Date>(initialMonth);
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(
    formatDateKey(new Date(), timezone),
  );
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState<Step>("pick-time");

  const [slotsByDay, setSlotsByDay] = useState<Map<string, Slot[]>>(new Map());
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!eventType) return;
    let ignore = false;
    setLoadingSlots(true);
    setError(null);

    const start = startOfMonth(visibleMonth);
    const end = endOfMonth(visibleMonth);
    const params = new URLSearchParams({
      eventTypeSlug: eventType.slug,
      start: start.toISOString(),
      end: end.toISOString(),
    });

    fetch(
      `/api/public/booking-links/${bookingLink.slug}/availability?${params}`,
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(getApiError(body));
        if (ignore) return;
        const grouped = groupSlotsByDay(body.slots ?? [], timezone);
        setSlotsByDay(grouped);
        setSelectedDateKey((current) => {
          if (current && grouped.has(current)) return current;
          const firstAvailable = [...grouped.keys()].sort()[0];
          return firstAvailable ?? current;
        });
      })
      .catch((fetchError) => {
        if (!ignore) {
          setError(fetchError.message || "Failed to load availability");
        }
      })
      .finally(() => {
        if (!ignore) setLoadingSlots(false);
      });

    return () => {
      ignore = true;
    };
  }, [bookingLink.slug, visibleMonth, eventType, timezone]);

  if (!eventType) {
    return (
      <BookingShell>
        <NotFoundCard title={bookingLink.title} />
      </BookingShell>
    );
  }

  const handleSubmit = async (
    formValues: { name: string; email: string; note: string },
    onError: (message: string) => void,
  ) => {
    if (!selectedSlot) return;
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: bookingLink.slug,
          eventTypeSlug: eventType.slug,
          startTime: selectedSlot.startTime,
          timezone,
          guestName: formValues.name,
          guestEmail: formValues.email,
          guestNote: formValues.note || undefined,
          idempotencyToken: crypto.randomUUID(),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(getApiError(body));
      setSuccess(body);
      setStep("success");
    } catch (submitError) {
      onError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to create booking",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (step === "success" && success) {
    return (
      <BookingShell>
        <BookingSuccessCard
          eventType={eventType}
          bookingLink={bookingLink}
          success={success}
          timezone={timezone}
        />
      </BookingShell>
    );
  }

  if (step === "details" && selectedSlot) {
    return (
      <BookingShell>
        <DetailsStep
          eventType={eventType}
          bookingLink={bookingLink}
          slot={selectedSlot}
          timezone={timezone}
          onBack={() => setStep("pick-time")}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </BookingShell>
    );
  }

  const selectedDateSlots = selectedDateKey
    ? (slotsByDay.get(selectedDateKey) ?? [])
    : [];

  return (
    <BookingShell>
      <PickTimeStep
        eventType={eventType}
        bookingLink={bookingLink}
        timezone={timezone}
        visibleMonth={visibleMonth}
        onMonthChange={setVisibleMonth}
        selectedDateKey={selectedDateKey}
        onSelectDate={setSelectedDateKey}
        slotsByDay={slotsByDay}
        slotsForDay={selectedDateSlots}
        loading={loadingSlots}
        error={error}
        onPickSlot={(slot) => {
          setSelectedSlot(slot);
          setStep("details");
        }}
      />
    </BookingShell>
  );
}

function PickTimeStep({
  eventType,
  bookingLink,
  timezone,
  visibleMonth,
  onMonthChange,
  selectedDateKey,
  onSelectDate,
  slotsByDay,
  slotsForDay,
  loading,
  error,
  onPickSlot,
}: {
  eventType: EventType;
  bookingLink: GetPublicBookingLinkResponse;
  timezone: string;
  visibleMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDateKey: string | null;
  onSelectDate: (key: string) => void;
  slotsByDay: Map<string, Slot[]>;
  slotsForDay: Slot[];
  loading: boolean;
  error: string | null;
  onPickSlot: (slot: Slot) => void;
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr_240px]">
      <Sidebar
        eventType={eventType}
        bookingLink={bookingLink}
        timezone={timezone}
        showDescription
      />
      <div className="border-t p-6 md:border-l md:border-t-0 md:p-7">
        <BookingCalendar
          visibleMonth={visibleMonth}
          onMonthChange={onMonthChange}
          selectedDateKey={selectedDateKey}
          onSelectDate={onSelectDate}
          slotsByDay={slotsByDay}
          timezone={timezone}
        />
      </div>
      <div className="border-t bg-muted/30 p-6 md:border-l md:border-t-0">
        <div className="text-sm font-semibold text-foreground">
          {selectedDateKey
            ? formatSelectedDateHeading(selectedDateKey, timezone)
            : "Pick a date"}
        </div>
        <div className="mb-3 mt-0.5 text-xs text-muted-foreground">
          {selectedDateKey
            ? `${slotsForDay.length} ${slotsForDay.length === 1 ? "slot" : "slots"}`
            : ""}
        </div>
        {loading ? (
          <SlotSkeleton />
        ) : error ? (
          <p className="text-sm text-red-500">{error}</p>
        ) : slotsForDay.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No slots available on this day.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {slotsForDay.map((slot) => (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => onPickSlot(slot)}
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium tabular-nums text-foreground transition-colors hover:border-blue-600 hover:text-blue-700"
              >
                {formatSlotTime(slot.startTime, timezone)}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function BookingCalendar({
  visibleMonth,
  onMonthChange,
  selectedDateKey,
  onSelectDate,
  slotsByDay,
  timezone,
}: {
  visibleMonth: Date;
  onMonthChange: (month: Date) => void;
  selectedDateKey: string | null;
  onSelectDate: (key: string) => void;
  slotsByDay: Map<string, Slot[]>;
  timezone: string;
}) {
  const todayKey = formatDateKey(new Date(), timezone);
  const selectedDate = selectedDateKey
    ? dateKeyToLocalDate(selectedDateKey)
    : undefined;

  const isUnavailable = (date: Date) => {
    const key = formatDateKey(date, timezone);
    return isBeforeToday(date, todayKey, timezone) || !slotsByDay.has(key);
  };

  return (
    <Calendar
      mode="single"
      month={visibleMonth}
      onMonthChange={onMonthChange}
      selected={selectedDate}
      onSelect={(date) => {
        if (!date || isUnavailable(date)) return;
        onSelectDate(formatDateKey(date, timezone));
      }}
      disabled={isUnavailable}
      showOutsideDays={false}
      modifiers={{
        available: (date) => !isUnavailable(date),
      }}
      modifiersClassNames={{
        available:
          "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300",
      }}
      className="mx-auto w-fit"
      classNames={{
        month: "space-y-4",
        table: "w-full border-collapse space-y-1",
        head_cell: "w-10 text-muted-foreground font-normal text-[0.8rem]",
        cell: "h-10 w-10 p-0 text-center text-sm",
        day: cn(
          "h-10 w-10 rounded-lg p-0 font-normal tabular-nums aria-selected:opacity-100",
        ),
        day_selected:
          "bg-blue-600 text-white hover:bg-blue-600 hover:text-white focus:bg-blue-600 focus:text-white",
        day_today: "ring-1 ring-blue-200",
        day_disabled:
          "cursor-not-allowed text-muted-foreground opacity-40 hover:bg-transparent",
      }}
    />
  );
}

function DetailsStep({
  eventType,
  bookingLink,
  slot,
  timezone,
  onBack,
  onSubmit,
  isSubmitting,
}: {
  eventType: EventType;
  bookingLink: GetPublicBookingLinkResponse;
  slot: Slot;
  timezone: string;
  onBack: () => void;
  onSubmit: (
    values: { name: string; email: string; note: string },
    onError: (message: string) => void,
  ) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!name.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    await onSubmit({ name, email, note }, (message) => setError(message));
  };

  return (
    <div className="grid grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
      <Sidebar
        eventType={eventType}
        bookingLink={bookingLink}
        timezone={timezone}
        slot={slot}
        backButton={
          <button
            type="button"
            onClick={onBack}
            className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3" />
            Back
          </button>
        }
      />
      <form
        onSubmit={handleSubmit}
        className="border-t p-7 md:border-l md:border-t-0"
      >
        <h2 className="text-xl font-medium tracking-tight text-foreground">
          Enter your details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          We'll send a calendar invite to your email.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <FormField label="Your name" required>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label="Email" required helper="Calendar invite goes here.">
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
          <FormField label="What would you like to discuss?" optional>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={4}
              className="block w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </FormField>
        </div>

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            By confirming, you agree to receive a calendar invite and reminders.
          </p>
          <Button type="submit" loading={isSubmitting} variant="primaryBlack">
            Confirm booking
            <ArrowRight className="ml-2 size-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function BookingSuccessCard({
  eventType,
  bookingLink,
  success,
  timezone,
}: {
  eventType: EventType;
  bookingLink: GetPublicBookingLinkResponse;
  success: SuccessState;
  timezone: string;
}) {
  return (
    <div className="grid grid-cols-1 overflow-hidden md:grid-cols-[300px_1fr]">
      <Sidebar
        eventType={eventType}
        bookingLink={bookingLink}
        timezone={timezone}
        slot={success}
      />
      <div className="border-t p-7 md:border-l md:border-t-0">
        <div className="flex items-center gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          <Check className="size-4" />
          You're booked. A calendar invite is on its way.
        </div>
        <h2 className="mt-6 text-xl font-medium tracking-tight text-foreground">
          {eventType.title} confirmed
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLongDateTime(success.startTime, timezone)}
        </p>
        {success.cancelUrl ? (
          <p className="mt-4 text-sm">
            Need to make a change?{" "}
            <a
              href={success.cancelUrl}
              className="font-medium text-blue-600 underline"
            >
              Cancel booking
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Sidebar({
  eventType,
  bookingLink,
  timezone,
  slot,
  backButton,
  showDescription,
}: {
  eventType: EventType;
  bookingLink: GetPublicBookingLinkResponse;
  timezone: string;
  slot?: Slot;
  backButton?: React.ReactNode;
  showDescription?: boolean;
}) {
  const hostName = eventType.hostName || bookingLink.title;
  const initial = (hostName || "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex flex-col gap-4 p-7">
      {backButton}
      <div className="flex size-12 items-center justify-center rounded-full bg-blue-50 text-lg font-semibold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
        {initial}
      </div>
      <div>
        <div className="text-sm text-muted-foreground">{hostName}</div>
        <h1 className="mt-0.5 text-2xl font-medium tracking-tight text-foreground">
          {eventType.title}
        </h1>
      </div>
      <div className="flex flex-col gap-2 text-sm text-muted-foreground">
        <SidebarRow icon={<Clock className="size-3.5" />}>
          {eventType.durationMinutes} min
        </SidebarRow>
        {slot ? (
          <SidebarRow icon={<CalendarIcon className="size-3.5" />}>
            <span className="font-medium text-foreground">
              {formatLongDateTime(slot.startTime, timezone)}
            </span>
          </SidebarRow>
        ) : null}
        <SidebarRow icon={<LocationIcon type={eventType.locationType} />}>
          {locationLabel(eventType)}
        </SidebarRow>
        <SidebarRow icon={<Globe className="size-3.5" />}>
          {timezone}
        </SidebarRow>
      </div>
      {showDescription && eventType.description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {eventType.description}
        </p>
      ) : null}
      <div className="mt-auto flex items-center gap-1.5 border-t pt-4 text-xs text-muted-foreground">
        Powered by Inbox Zero
      </div>
    </div>
  );
}

function SidebarRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground/70">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function LocationIcon({ type }: { type: BookingEventTypeLocationType }) {
  const className = "size-3.5";
  switch (type) {
    case BookingEventTypeLocationType.GOOGLE_MEET:
      return <Video className={className} />;
    case BookingEventTypeLocationType.PHONE:
      return <Phone className={className} />;
    case BookingEventTypeLocationType.IN_PERSON:
      return <MapPin className={className} />;
    default:
      return <Info className={className} />;
  }
}

function locationLabel(eventType: EventType): string {
  if (eventType.locationType === BookingEventTypeLocationType.GOOGLE_MEET) {
    return "Google Meet";
  }
  return eventType.locationValue || "Custom";
}

function FormField({
  label,
  required,
  optional,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  helper?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 text-sm font-medium text-foreground">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
        {optional ? (
          <span className="text-muted-foreground"> (optional)</span>
        ) : null}
      </div>
      {children}
      {helper ? (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Info className="size-3" />
          {helper}
        </div>
      ) : null}
    </div>
  );
}

function NotFoundCard({ title }: { title: string }) {
  return (
    <div className="p-7">
      <h1 className="text-xl font-medium tracking-tight text-foreground">
        {title}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Event type not found.
      </p>
    </div>
  );
}

function SlotSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function BookingShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border bg-background shadow-lg">
        {children}
      </div>
    </main>
  );
}

export function PublicShell({
  children,
  title,
  subtitle,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <main className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <div>
          <h1 className="text-2xl font-medium tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
        {children}
      </div>
    </main>
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

function formatDateKey(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function dateKeyToLocalDate(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function isBeforeToday(date: Date, todayKey: string, timezone: string) {
  return formatDateKey(date, timezone) < todayKey;
}

function groupSlotsByDay(slots: Slot[], timezone: string) {
  const map = new Map<string, Slot[]>();
  for (const slot of slots) {
    const key = formatDateKey(new Date(slot.startTime), timezone);
    const list = map.get(key) ?? [];
    list.push(slot);
    map.set(key, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }
  return map;
}

function formatSelectedDateHeading(key: string, timezone: string) {
  const date = new Date(`${key}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(date);
}

function formatSlotTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

function formatLongDateTime(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(value));
}

export function getApiError(body: unknown) {
  if (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof (body as { error?: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return "Request failed";
}
