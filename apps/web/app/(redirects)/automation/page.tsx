import { redirectToEmailAccountPath } from "@/utils/account";

export default async function AutomationPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/automation", await searchParams);
}
