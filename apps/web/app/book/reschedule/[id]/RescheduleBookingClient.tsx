"use client";

import { useMemo, useState } from "react";
import {
  parseAsInteger,
  parseAsIsoDate,
  parseAsString,
  useQueryState,
  useQueryStates,
} from "nuqs";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingShell } from "@/app/book/[slug]/BookingPageClient";
import { BookingSidebar } from "@/app/book/[slug]/BookingSidebar";
import { useAvailability } from "@/app/book/[slug]/useAvailability";
import { PickTimeStep, useSlotSelection } from "@/app/book/[slug]/PickTimeStep";
import {
  endOfMonth,
  formatLongDateTime,
  getApiError,
  getInitialVisibleMonthDate,
  normalizeTimezone,
  parseSlotParam,
  startOfMonth,
  type Slot,
} from "@/app/book/[slug]/booking-helpers";
import type { getPublicBookingForManagement } from "@/utils/booking/public";

type BookingMetadata = NonNullable<
  Awaited<ReturnType<typeof getPublicBookingForManagement>>
>;

type RescheduleSuccess = {
  startTime: string;
  endTime: string;
};

export function RescheduleBookingClient({
  booking,
  bookingToken,
}: {
  booking: BookingMetadata;
  bookingToken: string;
}) {
  const bookingLink = booking.bookingLink;
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

  const [success, setSuccess] = useState<RescheduleSuccess | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const cancelHref = `/book/cancel/${booking.id}?token=${encodeURIComponent(bookingToken)}`;

  const {
    data,
    error: availabilityError,
    isLoading: loadingSlots,
  } = useAvailability({
    slug: bookingLink.slug,
    start: visibleMonth,
    end: endOfMonth(visibleMonth),
    reschedule: { bookingId: booking.id, token: bookingToken },
  });

  const { slotsByDay, selectedDateKey, setSelectedDateKey, slotsForDay } =
    useSlotSelection({ data, loadingSlots, timezone, selectedSlot });

  const handleSubmit = async (onError: (message: string) => void) => {
    if (!selectedSlot) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/public/bookings/${booking.id}/reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: bookingToken,
            startTime: selectedSlot.startTime,
            timezone,
          }),
        },
      );
      const body = await response.json();
      if (!response.ok) throw new Error(getApiError(body));
      setSuccess(body);
    } catch (submitError) {
      onError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to reschedule booking",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <BookingShell size="compact">
        <RescheduleSuccessCard
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
        <ConfirmRescheduleStep
          bookingLink={bookingLink}
          slot={selectedSlot}
          previousStartTime={booking.startTime}
          timezone={timezone}
          onBack={() => setBookingParams({ slot: null, duration: null })}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          cancelHref={cancelHref}
        />
      </BookingShell>
    );
  }

  return (
    <BookingShell>
      <div className="border-b bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200 sm:px-6">
        <div>
          Rescheduling your{" "}
          <strong>{formatLongDateTime(booking.startTime, timezone)}</strong>{" "}
          booking — pick a new time below.
        </div>
        <a
          href={cancelHref}
          className="mt-1 inline-block font-medium underline"
        >
          Cancel this booking instead
        </a>
      </div>
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
          />
        }
      />
    </BookingShell>
  );
}

function ConfirmRescheduleStep({
  bookingLink,
  slot,
  previousStartTime,
  timezone,
  onBack,
  onSubmit,
  isSubmitting,
  cancelHref,
}: {
  bookingLink: BookingMetadata["bookingLink"];
  slot: Slot;
  previousStartTime: string;
  timezone: string;
  onBack: () => void;
  onSubmit: (onError: (message: string) => void) => Promise<void>;
  isSubmitting: boolean;
  cancelHref: string;
}) {
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    await onSubmit((message) => setError(message));
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
          Confirm new time
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your meeting will move to:
        </p>
        <p className="mt-2 text-base font-medium text-foreground">
          {formatLongDateTime(slot.startTime, timezone)}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Previously: {formatLongDateTime(previousStartTime, timezone)}
        </p>

        {error ? <p className="mt-4 text-sm text-red-500">{error}</p> : null}

        <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <a
            href={cancelHref}
            className="text-center text-sm font-medium text-muted-foreground underline hover:text-foreground"
          >
            Cancel instead
          </a>
          <Button
            type="submit"
            loading={isSubmitting}
            variant="primaryBlack"
            className="w-full shrink-0 sm:w-auto"
          >
            Confirm reschedule
            <ArrowRight className="ml-2 size-3.5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function RescheduleSuccessCard({
  bookingLink,
  success,
  timezone,
}: {
  bookingLink: BookingMetadata["bookingLink"];
  success: RescheduleSuccess;
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
          Your booking has been rescheduled. An updated calendar invite is on
          its way.
        </div>
        <h2 className="mt-6 text-xl font-medium tracking-tight text-foreground">
          {bookingLink.title} rescheduled
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatLongDateTime(success.startTime, timezone)}
        </p>
      </div>
    </div>
  );
}
