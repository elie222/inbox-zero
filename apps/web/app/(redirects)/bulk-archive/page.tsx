import { redirectToEmailAccountPath } from "@/utils/account";

export default async function BulkArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/bulk-archive", await searchParams);
}
