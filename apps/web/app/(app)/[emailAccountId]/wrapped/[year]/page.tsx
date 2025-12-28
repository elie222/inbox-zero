import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { WrappedViewer } from "./WrappedViewer";

export default async function WrappedYearPage({
  params,
}: {
  params: Promise<{ emailAccountId: string; year: string }>;
}) {
  const { year } = await params;
  const yearNum = Number.parseInt(year, 10);

  if (Number.isNaN(yearNum) || yearNum < 2020 || yearNum > 2030) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="text-muted-foreground">Invalid year</p>
      </div>
    );
  }

  return (
    <>
      <PermissionsCheck />
      <WrappedViewer year={yearNum} />
    </>
  );
}
