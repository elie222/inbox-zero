import useSWR from "swr";
import type { MailSettingsResponse } from "@/app/api/mail/settings/route";

export function useMailSettings() {
  return useSWR<MailSettingsResponse>("/api/mail/settings");
}
