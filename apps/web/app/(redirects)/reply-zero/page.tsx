import { redirectToEmailAccountPath } from "@/utils/account";

export default async function ReplyZeroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/reply-zero", await searchParams);
}
