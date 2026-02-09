import { redirect } from "next/navigation";
import { buildRedirectUrl } from "@/utils/redirect";

export default async function EmailAccountSettingsPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const searchParams = await props.searchParams;
  redirect(buildRedirectUrl("/settings", searchParams));
}
