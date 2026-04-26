import { redirectToEmailAccountPath } from "@/utils/account";

export default async function CalendarsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/calendars", await searchParams);
}
