import { redirectToEmailAccountPath } from "@/utils/account";

export default async function ReplyZeroPage() {
  await redirectToEmailAccountPath("/reply-zero");
}
