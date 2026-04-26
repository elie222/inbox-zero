import { redirectToEmailAccountPath } from "@/utils/account";

export default async function DebugPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/debug", await searchParams);
}
