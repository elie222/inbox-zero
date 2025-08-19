import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkUnsubscribe } from "./BulkUnsubscribeSection";

export default async function BulkUnsubscribePage() {
  return (
    <>
      <PermissionsCheck />
      <BulkUnsubscribe />
    </>
  );
}
