import useSWR from "swr";
import type { GetBookingLinksResponse } from "@/app/api/user/booking-links/route";

export function useBookingLinks() {
  return useSWR<GetBookingLinksResponse>("/api/user/booking-links");
}
