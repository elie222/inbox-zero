import { redirectToEmailAccountPath } from "@/utils/account";

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/briefs", await searchParams);
}
