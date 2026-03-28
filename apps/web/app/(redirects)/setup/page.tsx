import { redirectToEmailAccountPath } from "@/utils/account";

export default async function SetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/setup", await searchParams);
}
