import { Suspense } from "react";
import { ScheduledActionsTable } from "./ScheduledActionsTable";

export default function ScheduledActionsPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Scheduled Actions</h1>
        <p className="text-muted-foreground">
          Manage and monitor all scheduled rule actions across users
        </p>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <ScheduledActionsTable />
      </Suspense>
    </div>
  );
}
