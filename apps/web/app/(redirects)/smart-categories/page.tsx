import { redirectToEmailAccountPath } from "@/utils/account";

export default async function SmartCategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/smart-categories", await searchParams);
}
