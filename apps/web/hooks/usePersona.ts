import useSWR from "swr";
import type { GetPersonaResponse } from "@/app/api/user/persona/route";

export function usePersona() {
  return useSWR<GetPersonaResponse>("/api/user/persona");
}
