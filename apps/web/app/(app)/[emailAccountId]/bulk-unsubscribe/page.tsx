import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkUnsubscribe } from "./BulkUnsubscribeSection";

export default async function BulkUnsubscribePage() {
  return (
    <div className="h-full overflow-y-auto">
      <PermissionsCheck />
      <BulkUnsubscribe />
    </div>
  );
}
