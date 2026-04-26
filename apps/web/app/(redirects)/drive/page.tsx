import { redirectToEmailAccountPath } from "@/utils/account";

export default async function DrivePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/drive", await searchParams);
}
