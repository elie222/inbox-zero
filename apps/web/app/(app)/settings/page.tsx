import { SettingsContent } from "@/app/(app)/settings/SettingsContent";
import { PageHeader } from "@/components/PageHeader";

export default function SettingsPage() {
  return (
    <div className="content-container pb-12">
      <div className="mx-auto max-w-5xl space-y-10 pt-4">
        <PageHeader title="Settings" />
        <SettingsContent />
      </div>
    </div>
  );
}
