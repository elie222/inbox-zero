import { redirectToEmailAccountPath } from "@/utils/account";

export default async function AssistantPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/assistant", await searchParams);
}
