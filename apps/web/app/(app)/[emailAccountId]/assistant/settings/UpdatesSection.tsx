"use client";

import { DigestSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/DigestSetting";
import { FollowUpRemindersSetting } from "@/app/(app)/[emailAccountId]/assistant/settings/FollowUpRemindersSetting";
import { SectionHeader } from "@/components/Typography";
import { env } from "@/env";
import { useFollowUpRemindersEnabled } from "@/hooks/useFeatureFlags";

// Both rows in this section are feature-flagged, and follow-up reminders is
// gated on a PostHog flag the server can't read. Deciding here keeps the
// "Updates" header from rendering above an empty section when both are off.
export function UpdatesSection() {
  const showFollowUpReminders = useFollowUpRemindersEnabled();
  const showDigest = env.NEXT_PUBLIC_DIGEST_ENABLED;

  if (!(showFollowUpReminders || showDigest)) return null;

  return (
    <div className="space-y-2">
      <SectionHeader>Updates</SectionHeader>
      {showFollowUpReminders && <FollowUpRemindersSetting />}
      {showDigest && <DigestSetting />}
    </div>
  );
}
