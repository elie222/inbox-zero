import useSWR from "swr";
import type { GetPublicBookingAvailabilityResponse } from "@/app/api/public/booking-links/[slug]/availability/route";
import { getApiError } from "./booking-helpers";

export function useAvailability({
  slug,
  start,
  end,
  reschedule,
}: {
  slug: string;
  start: Date;
  end: Date;
  reschedule?: { bookingId: string; token: string };
}) {
  const params = new URLSearchParams({
    start: start.toISOString(),
    end: end.toISOString(),
  });
  if (reschedule) {
    params.set("rescheduleBookingId", reschedule.bookingId);
    params.set("token", reschedule.token);
  }
  return useSWR<GetPublicBookingAvailabilityResponse, Error>(
    `/api/public/booking-links/${slug}/availability?${params}`,
    async (url: string) => {
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok) throw new Error(getApiError(body));
      return body;
    },
  );
}
