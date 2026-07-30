"use client";

import useSWR from "swr";
import { useAccount } from "@/providers/EmailAccountProvider";
import { contactsListKey } from "@/utils/contacts";

// Warms the SWR caches behind the app tray's other destinations once the
// page the user actually opened has settled. Switching to Contacts or Tasks
// then paints with data already in hand instead of a spinner. Uses the same
// keys as the pages, so the warmed entry IS their first load.
export function AppDataPreloader() {
  const { emailAccountId } = useAccount();

  useSWR(emailAccountId ? "/api/tasks" : null, {
    revalidateOnFocus: false,
  });
  useSWR(emailAccountId ? contactsListKey() : null, {
    revalidateOnFocus: false,
  });

  return null;
}
