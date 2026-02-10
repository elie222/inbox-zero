import { redirectToEmailAccountPath } from "@/utils/account";

export default async function CleanPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/clean", await searchParams);
}
