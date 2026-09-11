"use client";

import { SettingsContent } from "@/app/(app)/settings/SettingsContent";
import { PageHeader } from "@/components/PageHeader";
import { useSettingsDialog } from "@/hooks/useSettingsDialog";

export default function SettingsPage() {
  const { isSettingsOpen } = useSettingsDialog();

  return (
    <div className="content-container pb-12">
      <div className="mx-auto max-w-5xl space-y-10 pt-4">
        <PageHeader title="Settings" />
        {/* The dialog renders the same content, so only mount one of them. */}
        {!isSettingsOpen && <SettingsContent />}
      </div>
    </div>
  );
}
