import { redirectToEmailAccountPath } from "@/utils/account";

export default async function ColdEmailBlockerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/cold-email-blocker", await searchParams);
}
