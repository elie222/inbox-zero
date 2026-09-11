import useSWR from "swr";
import type { GetAvailabilityResponse } from "@/app/api/user/availability/route";

export function useDefaultAvailability() {
  return useSWR<GetAvailabilityResponse>("/api/user/availability");
}
