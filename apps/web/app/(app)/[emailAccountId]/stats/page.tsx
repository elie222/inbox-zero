import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { Stats } from "./Stats";

export default async function StatsPage() {
  return (
    <>
      <PermissionsCheck />
      <Stats />
    </>
  );
}
