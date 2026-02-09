import { redirectToEmailAccountPath } from "@/utils/account";

export default async function SettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  await redirectToEmailAccountPath("/settings", searchParams);
}
