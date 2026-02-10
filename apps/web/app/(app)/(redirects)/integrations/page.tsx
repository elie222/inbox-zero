import { redirectToEmailAccountPath } from "@/utils/account";

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/integrations", await searchParams);
}
