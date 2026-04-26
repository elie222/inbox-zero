import { redirectToEmailAccountPath } from "@/utils/account";

export default async function BulkUnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/bulk-unsubscribe", await searchParams);
}
