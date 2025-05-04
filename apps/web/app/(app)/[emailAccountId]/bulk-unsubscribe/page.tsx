import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkUnsubscribe } from "./BulkUnsubscribe";

export default async function BulkUnsubscribePage() {
  // await checkAndRedirectForUpgrade();
  return (
    <>
      <PermissionsCheck />
      <BulkUnsubscribe />
    </>
  );
}
