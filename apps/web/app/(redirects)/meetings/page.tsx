import { redirectToEmailAccountPath } from "@/utils/account";

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/meetings", await searchParams);
}
