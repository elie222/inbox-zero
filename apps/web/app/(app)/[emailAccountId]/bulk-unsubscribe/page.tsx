import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkUnsubscribe } from "./BulkUnsubscribeSection";

export const maxDuration = 180;

export default async function BulkUnsubscribePage() {
  return (
    <>
      <PermissionsCheck />
      <BulkUnsubscribe />
    </>
  );
}
