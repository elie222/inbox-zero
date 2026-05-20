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
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { BookingSidebar } from "./BookingSidebar";
import { useAvailability } from "./useAvailability";
import { PickTimeStep, useSlotSelection } from "./PickTimeStep";
import {
  endOfMonth,
  formatLongDateTime,
  getApiError,
  getInitialVisibleMonthDate,
  normalizeTimezone,
  parseSlotParam,
  startOfMonth,
  type Slot,
} from "./booking-helpers";

type BookingLink = GetPublicBookingLinkResponse;
type SuccessState = {
  cancelUrl?: string;
  rescheduleUrl?: string;
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

  const { slotsByDay, selectedDateKey, setSelectedDateKey, slotsForDay } =
    useSlotSelection({
      data,
      loadingSlots,
      timezone,
      selectedSlot,
    });

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

  return (
    <BookingShell>
      <PickTimeStep
        timezone={timezone}
        visibleMonth={visibleMonth}
        onMonthChange={setVisibleMonthDate}
        selectedDateKey={selectedDateKey}
        onSelectDate={setSelectedDateKey}
        slotsByDay={slotsByDay}
        slotsForDay={slotsForDay}
        loading={loadingSlots}
        error={availabilityError?.message ?? null}
        onPickSlot={(slot) =>
          setBookingParams({
            slot: slot.startTime,
            duration: bookingLink.durationMinutes,
          })
        }
        sidebar={
          <BookingSidebar
            bookingLink={bookingLink}
            timezone={timezone}
            onTimezoneChange={(nextTimezone) =>
              setTimezoneParam(normalizeTimezone(nextTimezone, defaultTimezone))
            }
            showDescription
          />
        }
      />
    </BookingShell>
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
        {success.rescheduleUrl || success.cancelUrl ? (
          <p className="mt-4 text-sm">
            Need to make a change?{" "}
            {success.rescheduleUrl ? (
              <a
                href={success.rescheduleUrl}
                className="font-medium text-blue-600 underline"
              >
                Reschedule
              </a>
            ) : null}
            {success.rescheduleUrl && success.cancelUrl ? " or " : null}
            {success.cancelUrl ? (
              <a
                href={success.cancelUrl}
                className="font-medium text-blue-600 underline"
              >
                cancel booking
              </a>
            ) : null}
            .
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
          size === "compact"
            ? "max-w-3xl"
            : "max-w-5xl md:max-h-[calc(100dvh-5rem)]",
        )}
      >
        {children}
      </div>
    </main>
  );
}
