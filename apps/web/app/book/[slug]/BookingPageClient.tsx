"use client";

import { useMemo, useState } from "react";
import {
  parseAsInteger,
  parseAsIsoDate,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { ArrowLeft, ArrowRight, Check, Info } from "lucide-react";
import type { GetPublicBookingLinkResponse } from "@/app/api/public/booking-links/[slug]/route";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { BookingSidebar, HourFormatToggle } from "./BookingSidebar";
import { useAvailability } from "./useAvailability";
import {
  dateKeyToLocalDate,
  detectDefaultHourFormat,
  endOfMonth,
  formatDateKey,
  formatLongDateTime,
  formatSelectedDateHeading,
  formatShortWeekdayName,
  formatSlotTime,
  getApiError,
  getInitialVisibleMonthDate,
  groupSlotsByDay,
  isBeforeToday,
  normalizeTimezone,
  parseSlotParam,
  startOfMonth,
  type HourFormat,
  type Slot,
} from "./booking-helpers";

type BookingLink = GetPublicBookingLinkResponse;
type SuccessState = {
  cancelUrl?: string;
  endTime: string;
  startTime: string;
};

export function BookingPageClient({
  bookingLink,
}: {
  bookingLink: BookingLink;
}) {
  const defaultTimezone = normalizeTimezone(
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "UTC",
  );
  const [{ slot: slotParam }, setBookingParams] = useQueryStates(
    {
      slot: parseAsString,
      duration: parseAsInteger,
    },
    { history: "push" },
  );
  const [timezoneParam, setTimezoneParam] = useQueryState(
    "tz",
    parseAsString.withDefault(defaultTimezone),
  );
  const timezone = normalizeTimezone(timezoneParam, defaultTimezone);
  const [visibleMonthDate, setVisibleMonthDate] = useQueryState(
    "month",
    parseAsIsoDate.withDefault(getInitialVisibleMonthDate(slotParam)),
  );
  const visibleMonth = startOfMonth(visibleMonthDate);

  const selectedSlot = useMemo(
    () => parseSlotParam(slotParam, bookingLink.durationMinutes),
    [slotParam, bookingLink.durationMinutes],
  );

  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(() =>
    formatDateKey(
      selectedSlot ? new Date(selectedSlot.startTime) : new Date(),
      timezone,
    ),
  );

  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    data,
    error: availabilityError,
    isLoading: loadingSlots,
  } = useAvailability({
    slug: bookingLink.slug,
    start: visibleMonth,
    end: endOfMonth(visibleMonth),
  });

  const slotsByDay = useMemo(
    () => groupSlotsByDay(data?.slots ?? [], timezone),
    [data?.slots, timezone],
  );

  const firstAvailableDateKey = useMemo(
    () => [...slotsByDay.keys()].sort()[0] ?? null,
    [slotsByDay],
  );
  const displayedSelectedDateKey = useMemo(() => {
    if (loadingSlots) return selectedDateKey;
    if (selectedDateKey && slotsByDay.has(selectedDateKey)) {
      return selectedDateKey;
    }
    return firstAvailableDateKey;
  }, [loadingSlots, selectedDateKey, slotsByDay, firstAvailableDateKey]);

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

  if (success) {
    return (
      <BookingShell size="compact">
        <BookingSuccessCard
          bookingLink={bookingLink}
          success={success}
          timezone={timezone}
        />
      </BookingShell>
    );
  }

  if (selectedSlot) {
    return (
      <BookingShell size="compact">
        <DetailsStep
          bookingLink={bookingLink}
          slot={selectedSlot}
          timezone={timezone}
          onBack={() => setBookingParams({ slot: null, duration: null })}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </BookingShell>
    );
  }

  const selectedDateSlots = displayedSelectedDateKey
    ? (slotsByDay.get(displayedSelectedDateKey) ?? [])
    : [];

  return (
    <BookingShell>
      <PickTimeStep
        bookingLink={bookingLink}
        timezone={timezone}
        onTimezoneChange={(nextTimezone) =>
          setTimezoneParam(normalizeTimezone(nextTimezone, defaultTimezone))
        }
        visibleMonth={visibleMonth}
        onMonthChange={setVisibleMonthDate}
        selectedDateKey={displayedSelectedDateKey}
        onSelectDate={setSelectedDateKey}
        slotsByDay={slotsByDay}
        slotsForDay={selectedDateSlots}
        loading={loadingSlots}
        error={availabilityError?.message ?? null}
        onPickSlot={(slot) =>
          setBookingParams({
            slot: slot.startTime,
            duration: bookingLink.durationMinutes,
          })
        }
      />
    </BookingShell>
  );
}

function PickTimeStep({
  bookingLink,
  timezone,
  onTimezoneChange,
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
  bookingLink: BookingLink;
  timezone: string;
  onTimezoneChange: (timezone: string) => void;
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
  const [hourFormat, setHourFormat] = useState<HourFormat>(() =>
    detectDefaultHourFormat(),
  );
  return (
    <div className="grid min-w-0 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)_240px]">
      <BookingSidebar
        bookingLink={bookingLink}
        timezone={timezone}
        onTimezoneChange={onTimezoneChange}
        showDescription
      />
      <div className="min-w-0 border-t p-4 sm:p-6 md:border-l md:border-t-0 md:p-7">
        <BookingCalendar
          visibleMonth={visibleMonth}
          onMonthChange={onMonthChange}
          selectedDateKey={selectedDateKey}
          onSelectDate={onSelectDate}
          slotsByDay={slotsByDay}
          timezone={timezone}
        />
      </div>
      <div className="min-w-0 border-t bg-muted/30 p-4 sm:p-6 md:max-h-none md:border-l md:border-t-0 md:p-7">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-sm font-semibold text-foreground">
            {selectedDateKey
              ? formatSelectedDateHeading(selectedDateKey)
              : "Pick a date"}
          </div>
          <HourFormatToggle value={hourFormat} onChange={setHourFormat} />
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
          <div className="flex max-h-[min(50vh,22rem)] flex-col gap-1.5 overflow-y-auto pr-1 md:max-h-none">
            {slotsForDay.map((slot) => (
              <button
                key={slot.startTime}
                type="button"
                onClick={() => onPickSlot(slot)}
                className="rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-medium tabular-nums text-foreground transition-colors hover:border-blue-600 hover:text-blue-700"
              >
                {formatSlotTime(slot.startTime, timezone, hourFormat)}
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
      weekStartsOn={1}
      month={visibleMonth}
      onMonthChange={onMonthChange}
      selected={selectedDate}
      onSelect={(date) => {
        if (!date || isUnavailable(date)) return;
        onSelectDate(formatDateKey(date, timezone));
      }}
      disabled={isUnavailable}
      showOutsideDays={false}
      formatters={{ formatWeekdayName: formatShortWeekdayName }}
      modifiers={{
        available: (date) => !isUnavailable(date),
      }}
      modifiersClassNames={{
        available:
          "bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300",
      }}
      className="mx-auto w-fit max-w-full"
      classNames={{
        month: "space-y-4",
        table: "w-full border-collapse space-y-1",
        head_row: "flex gap-0.5 sm:gap-1 md:gap-1.5",
        head_cell:
          "w-9 text-muted-foreground font-normal text-[0.6rem] uppercase tracking-wider sm:w-10 sm:text-[0.65rem] md:w-14 md:text-[0.7rem]",
        row: "flex w-full mt-1 gap-0.5 sm:mt-1.5 sm:gap-1 md:gap-1.5",
        cell: "size-9 p-0 text-center text-xs sm:size-10 sm:text-sm md:size-14",
        day: cn(
          "size-9 rounded-lg p-0 text-xs font-normal tabular-nums aria-selected:opacity-100 sm:size-10 sm:text-sm md:size-14",
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
  bookingLink,
  slot,
  timezone,
  onBack,
  onSubmit,
  isSubmitting,
}: {
  bookingLink: BookingLink;
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
    <div className="grid min-w-0 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
      <BookingSidebar
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
        className="min-w-0 border-t p-4 sm:p-6 md:border-l md:border-t-0 md:p-7"
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
          <FormField label="Email" required>
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

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <p className="text-xs text-muted-foreground sm:min-w-0 sm:flex-1 sm:pr-2">
            By confirming, you agree to receive a calendar invite and reminders.
          </p>
          <Button
            type="submit"
            loading={isSubmitting}
            variant="primaryBlack"
            className="w-full shrink-0 sm:w-auto"
          >
            Confirm booking
            <ArrowRight className="ml-2 size-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function BookingSuccessCard({
  bookingLink,
  success,
  timezone,
}: {
  bookingLink: BookingLink;
  success: SuccessState;
  timezone: string;
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 overflow-hidden md:grid-cols-[260px_minmax(0,1fr)]">
      <BookingSidebar
        bookingLink={bookingLink}
        timezone={timezone}
        slot={success}
      />
      <div className="min-w-0 border-t p-4 sm:p-6 md:border-l md:border-t-0 md:p-7">
        <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
          <Check className="mt-0.5 size-4 shrink-0" />
          You're booked. A calendar invite is on its way.
        </div>
        <h2 className="mt-6 text-xl font-medium tracking-tight text-foreground">
          {bookingLink.title} confirmed
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

function SlotSkeleton() {
  return (
    <div className="flex flex-col gap-1.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

export function BookingShell({
  children,
  size = "wide",
}: {
  children: React.ReactNode;
  size?: "compact" | "wide";
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] sm:px-4 sm:py-10">
      <div
        className={cn(
          "w-full min-w-0 overflow-hidden rounded-xl border bg-background shadow-lg sm:rounded-2xl",
          size === "compact" ? "max-w-3xl" : "max-w-5xl",
        )}
      >
        {children}
      </div>
    </main>
  );
}
