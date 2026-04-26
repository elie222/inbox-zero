import { redirectToEmailAccountPath } from "@/utils/account";

export default async function ChannelsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/channels", await searchParams);
}
