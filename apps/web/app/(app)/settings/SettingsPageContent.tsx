"use client";

import { SettingsContent } from "@/app/(app)/settings/SettingsContent";
import { useSettingsDialog } from "@/hooks/useSettingsDialog";

export function SettingsPageContent() {
  const { isSettingsOpen } = useSettingsDialog();

  // The dialog renders the same content, so only mount one of them.
  if (isSettingsOpen) return null;
  return <SettingsContent />;
}
