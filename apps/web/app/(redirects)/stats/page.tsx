import { redirectToEmailAccountPath } from "@/utils/account";

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/stats", await searchParams);
}
