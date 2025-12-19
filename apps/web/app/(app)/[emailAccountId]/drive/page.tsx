import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { DriveConnections } from "./DriveConnections";
import { ConnectDrive } from "./ConnectDrive";

export default function DrivePage() {
  return (
    <PageWrapper>
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 lg:gap-4">
        <PageHeader title="Drive Connections" />
        <ConnectDrive />
      </div>
      <div className="mt-6 space-y-4">
        <DriveConnections />
      </div>
    </PageWrapper>
  );
}
