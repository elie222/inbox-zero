import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { BulkArchive } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchive";

export default function BulkArchivePage() {
  return (
    <>
      <PermissionsCheck />
      <BulkArchive />
    </>
  );
}
