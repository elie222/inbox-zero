"use client";

import { useEffect, useRef } from "react";
import { useAction } from "next-safe-action/hooks";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { useOrgAccess } from "@/hooks/useOrgAccess";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";
import { useAccount } from "@/providers/EmailAccountProvider";
import { updateEmailAccountTimezoneAction } from "@/utils/actions/calendar";

// Briefings, drafts and digests fall back to UTC when no timezone is saved,
// so fill it from the browser on any page rather than waiting for a calendar page.
export function FillMissingTimezone() {
  const { emailAccountId } = useAccount();
  const { isAccountOwner } = useOrgAccess();
  const { data, mutate } = useEmailAccountFull();
  const analytics = useProductAnalytics();
  const attemptedRef = useRef(false);

  const { execute } = useAction(
    updateEmailAccountTimezoneAction.bind(null, emailAccountId),
    {
      onSuccess: ({ input }) => {
        analytics.captureAction("timezone_auto_set", {
          detected_timezone: input.timezone,
        });
        mutate();
      },
    },
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: execute is stable from useAction
  useEffect(() => {
    if (!emailAccountId || !isAccountOwner || !data) return;
    if (data.timezone !== null || attemptedRef.current) return;

    attemptedRef.current = true;
    execute({ timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  }, [emailAccountId, isAccountOwner, data]);

  return null;
}
