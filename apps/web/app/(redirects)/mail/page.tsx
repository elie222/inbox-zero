import { redirectToEmailAccountPath } from "@/utils/account";

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/mail", await searchParams);
}
