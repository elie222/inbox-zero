import { redirectToEmailAccountPath } from "@/utils/account";

export default async function QuickBulkArchivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/quick-bulk-archive", await searchParams);
}
