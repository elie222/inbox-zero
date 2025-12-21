import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DriveConnections } from "./DriveConnections";
import { ConnectDrive } from "./ConnectDrive";
import { FilingPreferences } from "./FilingPreferences";
import { FilingActivity } from "./FilingActivity";

export default function DrivePage() {
  return (
    <PageWrapper>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        <PageHeader title="Auto-file attachments" />
        <ConnectDrive />
      </div>
      <div className="mt-6 space-y-4">
        <DriveConnections />
        <FilingPreferences />
        <FilingActivity />
      </div>
    </PageWrapper>
  );
}
